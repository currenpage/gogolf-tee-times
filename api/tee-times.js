// api/tee-times.js

const {
  getForeupCourseBySlug,
  fetchForeupTeeTimesForDate,
} = require("../scrapers/foreup");

// In-memory cache (per Vercel serverless instance)
const CACHE = {};
// Cache time-to-live: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Build a cache key from course + date.
 */
function cacheKey(courseSlug, dateString) {
  return `${courseSlug}::${dateString}`;
}

/**
 * Try to get cached tee times for a course/date.
 */
function getFromCache(courseSlug, dateString) {
  const key = cacheKey(courseSlug, dateString);
  const entry = CACHE[key];
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  if (age > CACHE_TTL_MS) {
    delete CACHE[key];
    return null;
  }
  return entry.data;
}

/**
 * Store tee times in cache.
 */
function putInCache(courseSlug, dateString, data) {
  const key = cacheKey(courseSlug, dateString);
  CACHE[key] = {
    ts: Date.now(),
    data,
  };
}

/**
 * Parse "HH:mm" or "H:mm" into minutes from midnight.
 */
function parseTimeToMinutes(str) {
  if (!str) return null;
  const [hStr, mStr] = str.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Convert an ISO-like time string ("2024-11-15T13:12:00") into minutes from midnight.
 */
function isoTimeToMinutes(isoString) {
  if (!isoString || typeof isoString !== "string") return null;
  const parts = isoString.split("T");
  if (parts.length < 2) return null;
  const timePart = parts[1]; // "13:12:00"
  const [hStr, mStr] = timePart.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * /api/tee-times handler
 *
 * Query params:
 *   course: slug (e.g. "shadowmoss")     [required]
 *   date:   "YYYY-MM-DD"                 [required]
 *   start:  "HH:mm" window start         [optional]
 *   end:    "HH:mm" window end           [optional]
 */
module.exports = async (req, res) => {
  try {
    const { method } = req;
    if (method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { course: courseSlug, date, start, end } = req.query;

    if (!courseSlug || !date) {
      res
        .status(400)
        .json({ error: "Missing required query params: course, date" });
      return;
    }

    // Look up the course config
    const course = getForeupCourseBySlug(courseSlug);
    if (!course) {
      res.status(404).json({ error: `Unknown course: ${courseSlug}` });
      return;
    }

    // Retrieve from cache or scrape from ForeUp
    let teeTimes = getFromCache(courseSlug, date);
    if (!teeTimes) {
      teeTimes = await fetchForeupTeeTimesForDate(course, date);
      putInCache(courseSlug, date, teeTimes);
    }

    // If no time window specified, return all tee times
    if (!start && !end) {
      res.status(200).json({
        course: {
          slug: course.slug,
          name: course.name,
        },
        date,
        teeTimes,
      });
      return;
    }

    // Filter by window if start/end are provided
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);

    const filtered = teeTimes.filter((t) => {
      const mins = isoTimeToMinutes(t.time);
      if (mins === null) return false;
      if (startMinutes !== null && mins < startMinutes) return false;
      if (endMinutes !== null && mins > endMinutes) return false;
      return true;
    });

    res.status(200).json({
      course: {
        slug: course.slug,
        name: course.name,
      },
      date,
      teeTimes: filtered,
    });
  } catch (err) {
    console.error("Error in /api/tee-times:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};