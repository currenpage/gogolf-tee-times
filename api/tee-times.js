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
    let teeTimes = getCached(course, date);

    if (!teeTimes) {
      if (course === "all") {
        // Fetch all ForeUp + all Quick18 + all TeeitUp + all GolfBack courses in parallel
        const foreupPromises = foreupSlugs.map((slug) =>
          fetchForeUpTimesForCourse(slug, date)
        );

        const quick18Promises = quick18Slugs.map((slug) => {
          const cfg = QUICK18_COURSES[slug];
          return fetchQuick18TeeTimes(cfg.baseUrl, slug, cfg.name, date);
        });

        const teeitupPromises = TEEITUP_SLUGS.map((slug) => {
          if (slug === "santee_national") {
            return fetchTeeItUpTeeTimesForSantee(date);
          }
          if (slug === "stillwater") {
            return fetchTeeItUpTeeTimesForStillwater(date);
          }
          if (slug === "hidden_hills") {
            return fetchTeeItUpTeeTimesForHiddenHills(date);
          }
          if (slug === "blue_cypress") {
            return fetchTeeItUpTeeTimesForBlueCypress(date);
          }
          return Promise.resolve([]);
        });

        const golfbackPromises = GOLFBACK_SLUGS.map((slug) => {
          if (slug === "windsor_parke") {
            return fetchGolfBackTeeTimes(
              "5a90fb0c-b928-43f0-9486-d5d43c03d25d",
              "windsor_parke",
              "Windsor Parke Golf Club",
              date
            );
          }
          if (slug === "julington_creek") {
            return fetchGolfBackTeeTimes(
              "e52fc334-4363-4d53-8b13-3b2e60c49087", // Julington Creek courseId
              "julington_creek",
              "Julington Creek Golf Club",
              date
            );
          }
          return Promise.resolve([]);
        });

        const allSlugs = [
          ...foreupSlugs,
          ...quick18Slugs,
          ...TEEITUP_SLUGS,
          ...GOLFBACK_SLUGS,
        ];
        const allPromises = [
          ...foreupPromises,
          ...quick18Promises,
          ...teeitupPromises,
          ...golfbackPromises,
        ];

        const results = await Promise.allSettled(allPromises);

        teeTimes = [];
        results.forEach((result, idx) => {
          const slug = allSlugs[idx];
          if (result.status === "fulfilled") {
            teeTimes = teeTimes.concat(result.value);
          } else {
            console.error(
              `Error fetching tee times for ${slug}:`,
              result.reason
            );
          }
        });
      } else if (foreupSlugs.includes(course)) {
        teeTimes = await fetchForeUpTimesForCourse(course, date);
      } else if (quick18Slugs.includes(course)) {
        const cfg = QUICK18_COURSES[course];
        teeTimes = await fetchQuick18TeeTimes(
          cfg.baseUrl,
          course,
          cfg.name,
          date
        );
      } else if (course === "santee_national") {
        teeTimes = await fetchTeeItUpTeeTimesForSantee(date);
      } else if (course === "stillwater") {
        teeTimes = await fetchTeeItUpTeeTimesForStillwater(date);
      } else if (course === "hidden_hills") {
        teeTimes = await fetchTeeItUpTeeTimesForHiddenHills(date);
      } else if (course === "blue_cypress"){
        teeTimes = await fetchTeeItUpTeeTimesForBlueCypress(date);
      } else if (course === "windsor_parke") {
        teeTimes = await fetchGolfBackTeeTimes(
          "5a90fb0c-b928-43f0-9486-d5d43c03d25d",
          "windsor_parke",
          "Windsor Parke Golf Club",
          date
        );
      } else if (course === "julington_creek") {
        teeTimes = await fetchGolfBackTeeTimes(
          "e52fc334-4363-4d53-8b13-3b2e60c49087",
          "julington_creek",
          "Julington Creek Golf Club",
          date
        );
      } else {
        teeTimes = [];
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