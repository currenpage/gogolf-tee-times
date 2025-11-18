// scrapers/foreup.js

const https = require("https");

/**
 * Format a date string (YYYY-MM-DD) into ForeUp format (MM-DD-YYYY).
 * Example: 2025-11-18 -> 11-18-2025
 */
function formatDateForForeup(isoDateString) {
  const [year, month, day] = isoDateString.split("-");
  return `${month}-${day}-${year}`;
}

// Shadowmoss configuration (Tri-County Resident flow)
const SHADOWMOSS_CONFIG = {
  name: "Shadowmoss Golf Club",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 11335,
  schedule_id: 8813,
  schedule_ids: [8813],
};

/**
 * Build the Shadowmoss tee-times URL.
 */
function buildShadowmossUrl(dateString) {
  const formattedDate = formatDateForForeup(dateString);

  const params = new URLSearchParams({
    time: "all",
    date: formattedDate,
    holes: "all",
    players: "0",
    booking_class: String(SHADOWMOSS_CONFIG.booking_class),
    schedule_id: String(SHADOWMOSS_CONFIG.schedule_id),
    specials_only: "0",
    api_key: "no_limits",
  });

  // Add schedule_ids[] multiple params
  SHADOWMOSS_CONFIG.schedule_ids.forEach((id) => {
    params.append("schedule_ids[]", String(id));
  });

  return `${SHADOWMOSS_CONFIG.baseUrl}?${params.toString()}`;
}

/**
 * Low-level helper to GET JSON over HTTPS.
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
            reject(
              new Error(`Failed to parse JSON from ForeUp: ${err.message}`)
            );
          }
        });
      })
      .on("error", (err) => {
        reject(new Error(`HTTP error calling ForeUp: ${err.message}`));
      });
  });
}

/**
 * Normalize a single ForeUp tee time entry.
 */
function normalizeForeupTeeTime(raw, courseSlug, courseName) {
  return {
    courseSlug,
    courseName,
    time: raw.time || raw.start_time || null, // e.g. "2025-11-18T13:12:00"
    price:
      (typeof raw.green_fee === "number" && raw.green_fee) ||
      (typeof raw.rate === "number" && raw.rate) ||
      null,
    raw, // keep raw for debugging
  };
}

/**
 * Fetch tee times for Shadowmoss for a given ISO date ("YYYY-MM-DD").
 */
async function fetchShadowmossTeeTimes(dateString) {
  const url = buildShadowmossUrl(dateString);

  const raw = await fetchJson(url);

  // Sometimes ForeUp returns an array directly; sometimes wrapped.
  let arr = raw;
  if (!Array.isArray(arr)) {
    if (arr && Array.isArray(arr.times)) {
      arr = arr.times;
    } else {
      return [];
    }
  }

  return arr.map((item) =>
    normalizeForeupTeeTime(item, "shadowmoss", SHADOWMOSS_CONFIG.name)
  );
}

module.exports = {
  fetchShadowmossTeeTimes,
};