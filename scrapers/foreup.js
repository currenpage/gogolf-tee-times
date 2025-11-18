// scrapers/foreup.js

const fetch = require("node-fetch");

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
    booking_class: SHADOWMOSS_CONFIG.booking_class,
    schedule_id: SHADOWMOSS_CONFIG.schedule_id,
    specials_only: "0",
    api_key: "no_limits",
  });

  // Add schedule_ids[] multiple params
  SHADOWMOSS_CONFIG.schedule_ids.forEach((id) => {
    params.append("schedule_ids[]", id);
  });

  return `${SHADOWMOSS_CONFIG.baseUrl}?${params.toString()}`;
}

/**
 * Normalize the ForeUp API raw tee time object into a clean format.
 */
function normalizeForeupTeeTime(raw, courseSlug, courseName) {
  return {
    courseSlug,
    courseName,
    time: raw.time,    // format "2025-11-18T13:12:00"
    price: raw.green_fee || raw.rate || null, // fallback fields
    raw,               // keep raw object for debugging
  };
}

/**
 * Fetch tee times for Shadowmoss for a given ISO date ("YYYY-MM-DD").
 */
async function fetchShadowmossTeeTimes(dateString) {
  const url = buildShadowmossUrl(dateString);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`ForeUp request failed: ${res.status} ${res.statusText}`);
  }

  let data = await res.json();

  // Defensive: If ForeUp wraps response differently
  if (!Array.isArray(data)) {
    if (data && Array.isArray(data.times)) {
      data = data.times;
    } else {
      return [];
    }
  }

  return data.map((item) =>
    normalizeForeupTeeTime(item, "shadowmoss", SHADOWMOSS_CONFIG.name)
  );
}

/**
 * Export API the tee-times handler will call.
 */
module.exports = {
  fetchShadowmossTeeTimes,
};