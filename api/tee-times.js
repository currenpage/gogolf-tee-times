// api/tee-times.js

const { COURSE_CONFIGS, fetchForeUpTimesForCourse } = require("../scrapers/foreup");

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

    const supportedSlugs = Object.keys(COURSE_CONFIGS);

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
        // Fetch from all configured courses in parallel
        const promises = supportedSlugs.map((slug) =>
          fetchForeUpTimesForCourse(slug, date)
        );
        const results = await Promise.allSettled(promises);

        teeTimes = [];
        results.forEach((result, idx) => {
          const slug = supportedSlugs[idx];
          if (result.status === "fulfilled") {
            teeTimes = teeTimes.concat(result.value);
          } else {
            console.error(
              `Error fetching tee times for ${slug}:`,
              result.reason
            );
          }
        });
      } else {
        // Single course
        teeTimes = await fetchForeUpTimesForCourse(course, date);
      }

      storeCached(course, date, teeTimes);
    }

    const courseMeta =
      course === "all"
        ? { slug: "all", name: "All courses" }
        : { slug: course, name: COURSE_CONFIGS[course].name };

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