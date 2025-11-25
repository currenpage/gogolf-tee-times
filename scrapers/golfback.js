// scrapers/golfback.js
const https = require("https");

/**
 * Low-level POST helper for GolfBack.
 * You MUST fill in the correct headers/body from a real “Copy as cURL”
 * if the default empty ones do not work.
 */
function postGolfBackJson(courseId, dateString, requestBody, extraHeaders = {}) {
  const options = {
    hostname: "api.golfback.com",
    port: 443,
    path: `/api/v1/courses/${courseId}/date/${dateString}/teetimes`,
    method: "POST",
    headers: {
      "User-Agent": "GoGolf TeeTimes Dev",
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      // Add any real headers (Authorization, Origin, Referer, etc.) here:
      ...extraHeaders,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(
            new Error(
              `GolfBack HTTP ${res.statusCode}: ${data.slice(0, 300)}`
            )
          );
        }

        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(
            new Error(
              `GolfBack JSON parse error: ${err.message}. Body: ${data.slice(
                0,
                300
              )}`
            )
          );
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`GolfBack HTTP error: ${err.message}`));
    });

    if (requestBody) {
      req.write(JSON.stringify(requestBody));
    }

    req.end();
  });
}

/**
 * Normalize GolfBack response objects into your shared tee time shape.
 * This is intentionally defensive because we haven’t inspected real JSON yet.
 */
function normalizeGolfBackTeeTimes(rawArray, slug, courseName) {
  if (!Array.isArray(rawArray)) return [];

  return rawArray.map((tt) => {
    // Try several likely keys for the time field
    const time =
      tt.startTime ||
      tt.start_time ||
      tt.teeTime ||
      tt.tee_time ||
      tt.time ||
      null;

    // Try several likely keys for price
    let price = null;
    if (typeof tt.greenFee === "number") {
      price = tt.greenFee;
    } else if (typeof tt.greenFeeCents === "number") {
      price = tt.greenFeeCents / 100;
    } else if (tt.rate && typeof tt.rate.amount === "number") {
      price = tt.rate.amount;
    } else if (typeof tt.price === "number") {
      price = tt.price;
    }

    const maxPlayers =
      tt.maxPlayers ??
      tt.max_players ??
      tt.capacity ??
      null;

    const bookedPlayers =
      tt.bookedPlayers ??
      tt.booked_players ??
      tt.booked ??
      0;

    const availableSpots =
      maxPlayers != null ? Math.max(maxPlayers - bookedPlayers, 0) : null;

    const minPlayers =
      tt.minPlayers ??
      tt.min_players ??
      1;

    const bookingUrl =
      tt.bookingUrl ||
      tt.booking_url ||
      null;

    return {
      courseSlug: slug,
      courseName,
      time,
      price,
      availableSpots,
      minPlayers,
      maxPlayers,
      bookingUrl,
      raw: tt,
    };
  });
}

/**
 * Main public scraper function.
 *
 * courseId: GolfBack UUID for the course
 * slug:     your internal slug, e.g. "windsor_parke"
 * courseName: display name, e.g. "Windsor Parke Golf Club"
 * dateString: "YYYY-MM-DD"
 */
async function fetchGolfBackTeeTimes(courseId, slug, courseName, dateString) {
  // Default body is empty. If GolfBack requires specific filters (players, holes, time window),
  // fill them in here based on Copy-as-cURL.
  const requestBody = {
    // Example if needed later:
    // players: 2,
    // holes: 18,
    // startAt: 0,
    // endAt: 24,
  };

  // Default headers are only basic JSON headers. Add auth / origin / referer as needed.
  const extraHeaders = {
    // e.g.:
    // Authorization: "Bearer ...",
    // Origin: "https://<booking-site>",
    // Referer: "https://<booking-site>/teetimes",
  };

  const json = await postGolfBackJson(
    courseId,
    dateString,
    requestBody,
    extraHeaders
  );

  // GolfBack may respond with a raw array or wrapped data.
  let arr = [];

  if (Array.isArray(json)) {
    arr = json;
  } else if (Array.isArray(json.data)) {
    arr = json.data;
  } else if (json.data && Array.isArray(json.data.teeTimes)) {
    arr = json.data.teeTimes;
  } else if (Array.isArray(json.teeTimes)) {
    arr = json.teeTimes;
  }

  return normalizeGolfBackTeeTimes(arr, slug, courseName);
}

module.exports = {
  fetchGolfBackTeeTimes,
};