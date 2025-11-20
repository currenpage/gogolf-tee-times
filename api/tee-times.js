// api/tee-times.js

const { COURSE_CONFIGS, fetchForeUpTimesForCourse } = require("../scrapers/foreup");
const { fetchQuick18TeeTimes } = require("../scrapers/quick18");

// In-memory cache (per Vercel instance)
const CACHE = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(course, date) {
  return `${course}::${date}`;
}

function getCached(course, date) {
  const key = getCacheKey(course, date);
  const item = CACHE[key];
  if (!item) return null;

  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    delete CACHE[key];
    return null;
  }
  return item.value;
}

function storeCached(course, date, value) {
  CACHE[getCacheKey(course, date)] = {
    timestamp: Date.now(),
    value,
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { course: rawCourse, date } = req.query;

    if (!date) {
      res.status(400).json({ error: "Missing date parameter" });
      return;
    }

    // Default to shadowmoss if course not provided
    const course = rawCourse || "shadowmoss";

    // ForeUp + Quick18 supported slugs
    const foreupSlugs = Object.keys(COURSE_CONFIGS);
    const quick18Slugs = Object.keys(QUICK18_COURSES);
    const supportedSlugs = [...foreupSlugs, ...quick18Slugs];

    if (course !== "all" && !supportedSlugs.includes(course)) {
      res.status(400).json({
        error: `Unsupported course '${course}'. Supported: ${supportedSlugs.join(
          ", "
        )}, or 'all'.`,
      });
      return;
    }

    // Check cache
    let teeTimes = getCached(course, date);

    if (!teeTimes) {
      if (course === "all") {
        // Fetch from all ForeUp + all Quick18 courses in parallel
        const foreupPromises = foreupSlugs.map((slug) =>
          fetchForeUpTimesForCourse(slug, date)
        );

        const quick18Promises = quick18Slugs.map((slug) => {
          const cfg = QUICK18_COURSES[slug];
          return fetchQuick18TeeTimes(cfg.baseUrl, slug, cfg.name, date);
        });

        const allPromises = [...foreupPromises, ...quick18Promises];
        const results = await Promise.allSettled(allPromises);

        teeTimes = [];
        results.forEach((result, idx) => {
          if (result.status === "fulfilled") {
            teeTimes = teeTimes.concat(result.value);
          } else {
            console.error(
              `Error fetching tee times for course index ${idx}:`,
              result.reason
            );
          }
        });
      } else if (foreupSlugs.includes(course)) {
        // Single ForeUp course
        teeTimes = await fetchForeUpTimesForCourse(course, date);
      } else if (quick18Slugs.includes(course)) {
        // Single Quick18 course, e.g. dunes_west
        const cfg = QUICK18_COURSES[course];
        teeTimes = await fetchQuick18TeeTimes(
          cfg.baseUrl,
          course,
          cfg.name,
          date
        );
      }

      storeCached(course, date, teeTimes);
    }

    // Build course metadata for response
    let courseMeta;
    if (course === "all") {
      courseMeta = { slug: "all", name: "All courses" };
    } else if (foreupSlugs.includes(course)) {
      courseMeta = { slug: course, name: COURSE_CONFIGS[course].name };
    } else if (quick18Slugs.includes(course)) {
      courseMeta = { slug: course, name: QUICK18_COURSES[course].name };
    } else {
      // Fallback, shouldn't hit because of earlier validation
      courseMeta = { slug: course, name: course };
    }

    res.status(200).json({
      course: courseMeta,
      date,
      teeTimes,
    });
  } catch (err) {
    console.error("Error in /api/tee-times handler:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};