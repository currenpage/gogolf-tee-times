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
            "Accept": "application/json",
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
 * Fetch tee times for Santee National for a given ISO date "YYYY-MM-DD".
 * Normalized to the same shape as our other scrapers.
 */
async function fetchTeeItUpTeeTimesForSantee(dateString) {
  const facilityId = 5578;
  const alias = "santee-national-golf-club";

  const url = buildTeeItUpUrl(facilityId, dateString);
  const json = await fetchJson(url, alias);

  // TeeitUp response: array of "day blocks", each with a `teetimes` array.
  if (!Array.isArray(json)) {
    return [];
  }

  // Flatten all teetimes across all day blocks.
  const flattened = [];
  for (const dayBlock of json) {
    if (Array.isArray(dayBlock.teetimes)) {
      for (const t of dayBlock.teetimes) {
        // Keep dayInfo on raw by merging, tee time fields override if keys collide.
        flattened.push({
          dayInfo: dayBlock.dayInfo,
          ...t,
        });
      }
    }
  }

  // Now `flattened` is an array of actual tee time objects with `teetime`, `rates`, etc.
  return flattened.map((tt) => {
    // Take the first rate as the "primary" price.
    const primaryRate =
      Array.isArray(tt.rates) && tt.rates.length > 0 ? tt.rates[0] : null;

    // >>> REPLACED BLOCK STARTS HERE <<<
    let price = null;
    if (primaryRate) {
      // TeeitUp uses cents for greenFeeCart, e.g. 5900 → $59.00
      if (typeof primaryRate.greenFeeCart === "number") {
        price = primaryRate.greenFeeCart / 100;
      } else if (typeof primaryRate.greenFee === "number") {
        // fallback if they ever expose a plain green fee in cents
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
    // >>> REPLACED BLOCK ENDS HERE <<<

    const maxPlayers = tt.maxPlayers ?? null;
    const bookedPlayers = tt.bookedPlayers ?? 0;
    const availableSpots =
      maxPlayers != null ? Math.max(maxPlayers - bookedPlayers, 0) : null;

    return {
      courseSlug: "santee_national",
      courseName: "Santee National Golf Club",
      time: tt.teetime, // ISO string from TeeitUp, e.g. "2025-11-20T19:00:00.000Z"
      price,
      availableSpots,
      minPlayers: tt.minPlayers ?? null,
      maxPlayers,
      bookingUrl: null, // can be filled in later if we reverse-engineer their booking URL
      raw: tt, // full tee-time object (with dayInfo merged in) for debugging
    };
  });
}

module.exports = {
  fetchTeeItUpTeeTimesForSantee,
};