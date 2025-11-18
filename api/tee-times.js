// api/tee-times.js

const { fetchShadowmossTeeTimes } = require("../scrapers/foreup");

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

    const { course, date } = req.query;

    if (!course || !date) {
      res.status(400).json({ error: "Missing course or date parameter" });
      return;
    }

    if (course !== "shadowmoss") {
      res.status(400).json({ error: "Only shadowmoss is supported right now." });
      return;
    }

    // Check cache
    let teeTimes = getCached(course, date);
    if (!teeTimes) {
      teeTimes = await fetchShadowmossTeeTimes(date);
      storeCached(course, date, teeTimes);
    }

    res.status(200).json({
      course: { slug: "shadowmoss", name: "Shadowmoss Golf Club" },
      date,
      teeTimes,
    });
  } catch (err) {
    console.error("Error in /api/tee-times handler:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};