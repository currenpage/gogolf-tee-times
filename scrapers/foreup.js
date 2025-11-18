// scrapers/foreup.js

const https = require("https");
const { normalizeForeupResponse } = require("../utils/normalize");

// Multi-course ready: start with Shadowmoss, add more later.
const FOREUP_COURSES = [
  {
    slug: "shadowmoss",
    name: "Shadowmoss Golf Club",
    locationId: 21766, // from your booking URL
    serviceId: 8813,   // from your booking URL
    lat: 32.821,       // optional, approximate coordinates
    lon: -80.06,
  },
  // Add more ForeUp-based courses here later
];

/**
 * Look up a ForeUp course config by slug.
 */
function getForeupCourseBySlug(slug) {
  return FOREUP_COURSES.find((c) => c.slug === slug) || null;
}

/**
 * Generic helper to GET JSON over HTTPS.
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse JSON from ForeUp: ${err.message}`));
          }
        });
      })
      .on("error", (err) => {
        reject(new Error(`HTTP error calling ForeUp: ${err.message}`));
      });
  });
}

/**
 * Build the ForeUp tee-times URL for a given course + date.
 *
 * NOTE: ForeUp parameter details can vary by installation; if this
 * doesn't return the expected data, you can refine the params
 * by inspecting the Network tab on the Shadowmoss booking page.
 */
function buildForeupTimesUrl(course, dateString) {
  // dateString expected as "YYYY-MM-DD"
  const base = "https://foreupsoftware.com/index.php/api/booking/times";

  const params = new URLSearchParams({
    time: "all",
    date: dateString,
    holes: "18",
    booking_class: "online",
    location_id: String(course.locationId),
    service_id: String(course.serviceId),
    api_key: "no_limits", // common ForeUp pattern; can be adjusted
  });

  return `${base}?${params.toString()}`;
}

/**
 * Fetch tee times for a ForeUp course on a specific date ("YYYY-MM-DD").
 */
async function fetchForeupTeeTimesForDate(course, dateString) {
  const url = buildForeupTimesUrl(course, dateString);
  const raw = await fetchJson(url);
  return normalizeForeupResponse(raw, course);
}

module.exports = {
  FOREUP_COURSES,
  getForeupCourseBySlug,
  fetchForeupTeeTimesForDate,
};