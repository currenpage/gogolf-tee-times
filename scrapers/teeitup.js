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
 * Generic TeeitUp fetcher for any course, parameterized by facility + alias + slug/name.
 *
 * Normalized output shape:
 * {
 *   courseSlug,
 *   courseName,
 *   time,            // ISO string, e.g. "2025-11-22T12:10:00.000Z"
 *   price,           // number or null
 *   availableSpots,  // number or null
 *   minPlayers,      // number or null
 *   maxPlayers,      // number or null
 *   bookingUrl,      // currently null (can be filled in later)
 *   raw,             // original TeeitUp tee time object, dayInfo merged in
 * }
 */
async function fetchTeeItUpTeeTimesForCourse(dateString, courseConfig) {
  const { facilityId, alias, courseSlug, courseName } = courseConfig;

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
        // Merge dayInfo into each tee time object for convenience.
        flattened.push({
          dayInfo: dayBlock.dayInfo,
          ...t,
        });
      }
    }
  }

  if (flattened.length === 0) {
    return [];
  }

  return flattened.map((tt) => {
    // Take the first rate as the "primary" price.
    const primaryRate =
      Array.isArray(tt.rates) && tt.rates.length > 0 ? tt.rates[0] : null;

    let price = null;
    if (primaryRate) {
      // TeeitUp often uses cents for green fees, e.g. 5900 → $59.00
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
      time: tt.teetime || tt.teeTime || tt.time || null, // usually ISO string
      price,
      availableSpots,
      minPlayers: tt.minPlayers ?? null,
      maxPlayers,
      bookingUrl: null, // can be filled in later if we reverse-engineer their booking URL
      raw: tt, // full tee-time object (with dayInfo merged in) for debugging
    };
  });
}

/**
 * Santee National wrapper.
 */
async function fetchTeeItUpTeeTimesForSantee(dateString) {
  return fetchTeeItUpTeeTimesForCourse(dateString, {
    facilityId: 5578,
    alias: "santee-national-golf-club",
    courseSlug: "santee_national",
    courseName: "Santee National Golf Club",
  });
}

/**
 * Stillwater Golf & Country Club wrapper.
 */
async function fetchTeeItUpTeeTimesForStillwater(dateString) {
  return fetchTeeItUpTeeTimesForCourse(dateString, {
    facilityId: 17933,
    alias: "stillwater-golf-and-country-club",
    courseSlug: "stillwater",
    courseName: "Stillwater Golf and Country Club",
  });
}

/**
 * Hidden Hills Golf Club wrapper.
 */
async function fetchTeeItUpTeeTimesForHiddenHills(dateString) {
  return fetchTeeItUpTeeTimesForCourse(dateString, {
    facilityId: 15493, // from your URL
    alias: "hidden-hills-golf-club", // likely pattern - see note below
    courseSlug: "hidden_hills",
    courseName: "Hidden Hills Golf Club",
  });
}

/**
 * Blue Cypress Golf Club wrapper.
 */
async function fetchTeeItUpTeeTimesForBlueCypress(dateString) {
  return fetchTeeItUpTeeTimesForCourse(dateString, {
    facilityId: 4309, // from your URL
    alias: "blue-cypress-gc-jacksonvilles-premier-9-hole-facility", 
    courseSlug: "blue_cypress",
    courseName: "Blue Cypress Golf Club",
  });
}

module.exports = {
  fetchTeeItUpTeeTimesForSantee,
  fetchTeeItUpTeeTimesForStillwater,
  fetchTeeItUpTeeTimesForHiddenHills,
  fetchTeeItUpTeeTimesForBlueCypress
};