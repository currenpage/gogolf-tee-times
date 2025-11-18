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

//
// Course configurations for ForeUp courses
//

// Shadowmoss configuration (Tri-County Resident flow)
const SHADOWMOSS_CONFIG = {
  name: "Shadowmoss Golf Club",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 11335,
  schedule_id: 8813,
  schedule_ids: [8813],
};

// Charleston National configuration
const CHARLESTON_NATIONAL_CONFIG = {
  name: "Charleston National",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 9877,
  schedule_id: 7624,
  schedule_ids: [7624],
};

// Map of all supported courses
const COURSE_CONFIGS = {
  shadowmoss: SHADOWMOSS_CONFIG,
  charleston_national: CHARLESTON_NATIONAL_CONFIG,
};

/**
 * Build a ForeUp tee-times URL for ANY configured course.
 */
function buildForeUpUrl(config, dateString) {
  const formattedDate = formatDateForForeup(dateString);

  const params = new URLSearchParams({
    time: "all",
    date: formattedDate,
    holes: "all",
    players: "0",
    booking_class: String(config.booking_class),
    schedule_id: String(config.schedule_id),
    specials_only: "0",
    api_key: "no_limits",
  });

  // Add schedule_ids[] entries
  config.schedule_ids.forEach((id) => {
    params.append("schedule_ids[]", String(id));
  });

  return `${config.baseUrl}?${params.toString()}`;
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
 * Normalize a single ForeUp tee time entry into the shape the app expects.
 */
function normalizeForeupTeeTime(raw, courseSlug, courseName) {
  // Time usually looks like "2025-11-24 07:32"
  const time =
    raw.time || raw.start_time || null;

  // Price: prefer 18-hole green fee, then generic green_fee, then rate
  let price = null;
  if (typeof raw.green_fee_18 === "number") {
    price = raw.green_fee_18;
  } else if (typeof raw.green_fee === "number") {
    price = raw.green_fee;
  } else if (typeof raw.rate === "number") {
    price = raw.rate;
  }

  // Available spots: prefer 18-hole, then generic
  let availableSpots = null;
  if (typeof raw.available_spots_18 === "number") {
    availableSpots = raw.available_spots_18;
  } else if (typeof raw.available_spots === "number") {
    availableSpots = raw.available_spots;
  }

  return {
    courseSlug,
    courseName,
    time,
    price,
    availableSpots,
    raw, // keep raw for debugging
  };
}

/**
 * Fetch tee times for a given course slug and ISO date ("YYYY-MM-DD").
 */
async function fetchForeUpTimesForCourse(slug, dateString) {
  const config = COURSE_CONFIGS[slug];
  if (!config) {
    throw new Error(`Unknown course slug: ${slug}`);
  }

  const url = buildForeUpUrl(config, dateString);
  const raw = await fetchJson(url);

  // ForeUp usually returns an array, but defensively handle wrappers
  let arr = raw;
  if (!Array.isArray(arr)) {
    if (arr && Array.isArray(arr.times)) {
      arr = arr.times;
    } else {
      return [];
    }
  }

  return arr.map((item) =>
    normalizeForeupTeeTime(item, slug, config.name)
  );
}

module.exports = {
  COURSE_CONFIGS,
  fetchForeUpTimesForCourse,
};