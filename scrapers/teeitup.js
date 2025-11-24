// scrapers/teeitup.js

const https = require("https");

/**
 * Low-level helper to GET JSON with required TeeitUp headers.
 */
function fetchJson(url, alias) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "GoGolf TeeTimes Dev",
            Accept: "application/json",
            "x-be-alias": alias, // REQUIRED by TeeitUp
          },
        },
        (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return reject(
                new Error(
                  `HTTP ${res.statusCode} from TeeitUp: ${data.slice(0, 200)}`
                )
              );
            }

            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (err) {
              reject(
                new Error(
                  `JSON parse error: ${err.message}. Body (first 200): ${data.slice(
                    0,
                    200
                  )}`
                )
              );
            }
          });
        }
      )
      .on("error", (err) => {
        reject(new Error(`HTTP error calling TeeitUp: ${err.message}`));
      });
  });
}

/**
 * Build the TeeitUp tee-times URL for a facility + date.
 * dateString must be "YYYY-MM-DD".
 */
function buildTeeItUpUrl(facilityId, dateString) {
  return `https://phx-api-be-east-1b.kenna.io/v2/tee-times?date=${dateString}&facilityIds=${facilityId}`;
}

/**
 * Common normalizer for TeeitUp tee time objects.
 * Takes raw "flattened" tt and maps to our shared tee time shape.
 */
function normalizeTeeItUpTeeTime(tt, courseSlug, courseName, bookingUrlOverride = null) {
  const primaryRate =
    Array.isArray(tt.rates) && tt.rates.length > 0 ? tt.rates[0] : null;

  let price = null;
  if (primaryRate) {
    // TeeitUp uses cents for greenFeeCart, e.g. 5900 → $59.00
    if (typeof primaryRate.greenFeeCart === "number") {
      price = primaryRate.greenFeeCart / 100;
    } else if (typeof primaryRate.greenFee === "number") {
      price = primaryRate.greenFee / 100;
    } else if (typeof primaryRate.amount === "number") {
      price = primaryRate.amount;
    } else if (typeof primaryRate.price === "number") {
      price = primaryRate.price;
    } else if (
      primaryRate.price &&
      typeof primaryRate.price.amount === "number"
    ) {
      price = primaryRate.price.amount;
    }
  }

  const maxPlayers = tt.maxPlayers ?? null;
  const bookedPlayers = tt.bookedPlayers ?? 0;
  const availableSpots =
    maxPlayers != null ? Math.max(maxPlayers - bookedPlayers, 0) : null;

  return {
    courseSlug,
    courseName,
    time: tt.teetime, // ISO string from TeeitUp, e.g. "2025-11-20T19:00:00.000Z"
    price,
    availableSpots,
    minPlayers: tt.minPlayers ?? null,
    maxPlayers,
    bookingUrl: bookingUrlOverride,
    raw: tt,
  };
}

/**
 * Flatten TeeitUp "day blocks" into a plain array of tee time objects.
 */
function flattenTeeItUpResponse(json) {
  if (!Array.isArray(json)) {
    return [];
  }

  const flattened = [];
  for (const dayBlock of json) {
    if (Array.isArray(dayBlock.teetimes)) {
      for (const t of dayBlock.teetimes) {
        flattened.push({
          dayInfo: dayBlock.dayInfo,
          ...t,
        });
      }
    }
  }
  return flattened;
}

/**
 * Fetch tee times for Santee National for a given ISO date "YYYY-MM-DD".
 * Normalized to the same shape as our other scrapers.
 */
async function fetchTeeItUpTeeTimesForSantee(dateString) {
  const facilityId = 5578;
  const alias = "santee-national-golf-club";

  const url = buildTeeItUpUrl(facilityId, dateString);
  const json = await fetchJson(url, alias);

  const flattened = flattenTeeItUpResponse(json);

  return flattened.map((tt) =>
    normalizeTeeItUpTeeTime(
      tt,
      "santee_national",
      "Santee National Golf Club",
      null // no direct booking URL yet
    )
  );
}

/**
 * Fetch tee times for Stillwater Golf and Country Club for a given date.
 * NOTE: you must plug in the correct facilityId and alias from DevTools.
 */
async function fetchTeeItUpTeeTimesForStillwater(dateString) {
  // TODO: Replace with the real facilityIds value from the kenna.io request
  const facilityId = 17933; // placeholder – use actual facilityIds= value
  // TODO: Replace with the real x-be-alias header value
  const alias = "stillwater-golf-and-country-club"; // placeholder

  const url = buildTeeItUpUrl(facilityId, dateString);
  const json = await fetchJson(url, alias);

  const flattened = flattenTeeItUpResponse(json);

  return flattened.map((tt) =>
    normalizeTeeItUpTeeTime(
      tt,
      "stillwater",
      "Stillwater Golf and Country Club",
      "https://www.stillwatergcc.com/golf/teetime"
    )
  );
}

module.exports = {
  fetchTeeItUpTeeTimesForSantee,
  fetchTeeItUpTeeTimesForStillwater,
};