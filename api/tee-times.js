// api/tee-times.js

const {
  COURSE_CONFIGS,
  fetchForeUpTimesForCourse,
} = require("../scrapers/foreup");
const { fetchQuick18TeeTimes } = require("../scrapers/quick18");
const {
  fetchTeeItUpTeeTimesForSantee,
  fetchTeeItUpTeeTimesForStillwater,
  fetchTeeItUpTeeTimesForHiddenHills,
  fetchTeeItUpTeeTimesForBlueCypress,
} = require("../scrapers/teeitup");
const { fetchGolfBackTeeTimes } = require("../scrapers/golfback");
const { executeScraper } = require("../utils/scraper-helpers");

// In-memory cache (per Vercel instance)
const CACHE = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(course, date) {
  return `${course}::${date}`;
}

function getCached(course, date) {
  const key = getCacheKey(course, date);
  const entry = CACHE[key];
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete CACHE[key];
    return null;
  }
  return entry.value;
}

function storeCached(course, date, value) {
  CACHE[getCacheKey(course, date)] = {
    timestamp: Date.now(),
    value,
  };
}

/*
  Quick18-backed courses.
  Dunes West and Rivertowne both use Quick18.
*/
const QUICK18_COURSES = {
  rivertowne: {
    baseUrl: "https://rivertowne.quick18.com",
    name: "Rivertowne Country Club",
  },
  dunes_west: {
    baseUrl: "https://duneswest.quick18.com",
    name: "Dunes West Golf Club",
  },
};

// TeeitUp-backed courses
const TEEITUP_SLUGS = ["santee_national", "stillwater", "hidden_hills", "blue_cypress"];

// GolfBack-backed courses
const GOLFBACK_SLUGS = ["windsor_parke", "julington_creek"];

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

    // ForeUp slugs = only courses with type === "foreup"
    const foreupSlugs = Object.keys(COURSE_CONFIGS).filter(
      (slug) => COURSE_CONFIGS[slug].type === "foreup"
    );

    // Quick18 slugs = from QUICK18_COURSES map
    const quick18Slugs = Object.keys(QUICK18_COURSES);

    const supportedSlugs = [
      ...foreupSlugs,
      ...quick18Slugs,
      ...TEEITUP_SLUGS,
      ...GOLFBACK_SLUGS,
    ];

    if (course !== "all" && !supportedSlugs.includes(course)) {
      res.status(400).json({
        error: `Unsupported course '${course}'. Supported: ${supportedSlugs.join(
          ", "
        )}, or 'all'.`,
      });
      return;
    }

    // Check cache
    const cached = getCached(course, date);
    if (cached) {
      res.status(200).json({
        ...cached,
        metadata: {
          ...cached.metadata,
          cached: true,
        },
      });
      return;
    }

    let teeTimes = [];
    let errors = [];
    let totalCourses = 0;
    let successfulCourses = 0;

    if (course === "all") {
      // Build scraper tasks for all courses
      const tasks = [];

      // ForeUp courses
      foreupSlugs.forEach((slug) => {
        tasks.push({
          slug,
          provider: "foreup",
          fn: () => fetchForeUpTimesForCourse(slug, date),
        });
      });

      // Quick18 courses
      quick18Slugs.forEach((slug) => {
        const cfg = QUICK18_COURSES[slug];
        tasks.push({
          slug,
          provider: "quick18",
          fn: () => fetchQuick18TeeTimes(cfg.baseUrl, slug, cfg.name, date),
        });
      });

      // TeeitUp courses
      TEEITUP_SLUGS.forEach((slug) => {
        let fn;
        if (slug === "santee_national") {
          fn = () => fetchTeeItUpTeeTimesForSantee(date);
        } else if (slug === "stillwater") {
          fn = () => fetchTeeItUpTeeTimesForStillwater(date);
        } else if (slug === "hidden_hills") {
          fn = () => fetchTeeItUpTeeTimesForHiddenHills(date);
        } else if (slug === "blue_cypress") {
          fn = () => fetchTeeItUpTeeTimesForBlueCypress(date);
        } else {
          fn = () => Promise.resolve([]);
        }
        
        tasks.push({
          slug,
          provider: "teeitup",
          fn,
        });
      });

      // GolfBack courses
      GOLFBACK_SLUGS.forEach((slug) => {
        let fn;
        if (slug === "windsor_parke") {
          fn = () =>
            fetchGolfBackTeeTimes(
              "5a90fb0c-b928-43f0-9486-d5d43c03d25d",
              "windsor_parke",
              "Windsor Parke Golf Club",
              date
            );
        } else if (slug === "julington_creek") {
          fn = () =>
            fetchGolfBackTeeTimes(
              "e52fc334-4363-4d53-8b13-3b2e60c49087",
              "julington_creek",
              "Julington Creek Golf Club",
              date
            );
        } else {
          fn = () => Promise.resolve([]);
        }
        
        tasks.push({
          slug,
          provider: "golfback",
          fn,
        });
      });

      totalCourses = tasks.length;

      // Execute all scrapers with timeout + retry + validation
      const results = await Promise.all(
        tasks.map((task) =>
          executeScraper(task.fn, task.slug, task.provider)
        )
      );

      // Aggregate results
      results.forEach((result, idx) => {
        const task = tasks[idx];
        
        if (result.success) {
          successfulCourses++;
          teeTimes = teeTimes.concat(result.data);
        } else {
          errors.push({
            course: task.slug,
            provider: task.provider,
            error: result.error,
            timestamp: new Date().toISOString(),
          });
        }
      });
    } else {
      // Single course fetch
      totalCourses = 1;
      let scraperFn;
      let provider;

      if (foreupSlugs.includes(course)) {
        provider = "foreup";
        scraperFn = () => fetchForeUpTimesForCourse(course, date);
      } else if (quick18Slugs.includes(course)) {
        provider = "quick18";
        const cfg = QUICK18_COURSES[course];
        scraperFn = () => fetchQuick18TeeTimes(cfg.baseUrl, course, cfg.name, date);
      } else if (course === "santee_national") {
        provider = "teeitup";
        scraperFn = () => fetchTeeItUpTeeTimesForSantee(date);
      } else if (course === "stillwater") {
        provider = "teeitup";
        scraperFn = () => fetchTeeItUpTeeTimesForStillwater(date);
      } else if (course === "hidden_hills") {
        provider = "teeitup";
        scraperFn = () => fetchTeeItUpTeeTimesForHiddenHills(date);
      } else if (course === "blue_cypress") {
        provider = "teeitup";
        scraperFn = () => fetchTeeItUpTeeTimesForBlueCypress(date);
      } else if (course === "windsor_parke") {
        provider = "golfback";
        scraperFn = () =>
          fetchGolfBackTeeTimes(
            "5a90fb0c-b928-43f0-9486-d5d43c03d25d",
            "windsor_parke",
            "Windsor Parke Golf Club",
            date
          );
      } else if (course === "julington_creek") {
        provider = "golfback";
        scraperFn = () =>
          fetchGolfBackTeeTimes(
            "e52fc334-4363-4d53-8b13-3b2e60c49087",
            "julington_creek",
            "Julington Creek Golf Club",
            date
          );
      } else {
        teeTimes = [];
      }

      if (scraperFn) {
        const result = await executeScraper(scraperFn, course, provider);
        
        if (result.success) {
          successfulCourses = 1;
          teeTimes = result.data;
        } else {
          errors.push({
            course,
            provider,
            error: result.error,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Build course metadata for response
    let courseMeta;
    if (course === "all") {
      courseMeta = { slug: "all", name: "All courses" };
    } else if (foreupSlugs.includes(course)) {
      courseMeta = { slug: course, name: COURSE_CONFIGS[course].name };
    } else if (quick18Slugs.includes(course)) {
      courseMeta = { slug: course, name: QUICK18_COURSES[course].name };
    } else if (course === "santee_national") {
      courseMeta = {
        slug: "santee_national",
        name: "Santee National Golf Club",
      };
    } else if (course === "stillwater") {
      courseMeta = {
        slug: "stillwater",
        name: "Stillwater Golf and Country Club",
      };
    } else if (course === "hidden_hills") {
      courseMeta = {
        slug: "hidden_hills",
        name: "Hidden Hills Golf Club",
      };
    } else if (course === "blue_cypress") {
      courseMeta = {
        slug: "blue_cypress",
        name: "Blue Cypress Golf Club",
      };
    } else if (course === "julington_creek") {
      courseMeta = {
        slug: "julington_creek",
        name: "Julington Creek Golf Club",
      };
    } else if (course === "windsor_parke") {
      courseMeta = {
        slug: "windsor_parke",
        name: "Windsor Parke Golf Club",
      };
    } else {
      courseMeta = { slug: course, name: course };
    }

    const responseData = {
      course: courseMeta,
      date,
      teeTimes,
      metadata: {
        totalCourses,
        successfulCourses,
        failedCourses: totalCourses - successfulCourses,
        cached: false,
        errors: errors.length > 0 ? errors : undefined,
      },
    };

    // Store in cache
    storeCached(course, date, responseData);

    res.status(200).json(responseData);
  } catch (err) {
    console.error("Error in /api/tee-times handler:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};