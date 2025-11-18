// utils/normalize.js

/**
 * Normalize a single tee time from a ForeUp booking response into a common shape.
 */
function normalizeForeupTime(raw, course) {
  // ForeUp often sends something like "2024-11-15T13:12:00" in a time field.
  const time = raw.time || raw.start_time || raw.tee_time || null;

  let price = null;
  if (typeof raw.green_fee === "number") {
    price = raw.green_fee;
  } else if (typeof raw.rate === "number") {
    price = raw.rate;
  } else if (raw.rate && typeof raw.rate.amount === "number") {
    price = raw.rate.amount;
  }

  return {
    courseSlug: course.slug,
    courseName: course.name,
    time,   // ISO-like string; the app will format this
    price,  // number or null
    raw,    // keep the raw object for debugging/extension
  };
}

/**
 * Normalize an array of ForeUp tee times.
 */
function normalizeForeupResponse(rawArray, course) {
  if (!Array.isArray(rawArray)) return [];
  return rawArray.map((item) => normalizeForeupTime(item, course));
}

module.exports = {
  normalizeForeupResponse,
};