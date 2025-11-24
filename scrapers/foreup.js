// scrapers/foreup.js

const https = require("https");

/**
 * Format a date string (YYYY-MM-DD) into ForeUp format (MM-DD-YYYY)
 */
function formatDateForForeup(isoDateString) {
  const [year, month, day] = isoDateString.split("-");
  return `${month}-${day}-${year}`;
}

/*
|--------------------------------------------------------------------------
|  FOREUP COURSE CONFIGS
|--------------------------------------------------------------------------
|  Only include ForeUp-based courses here.
|  Quick18 + TeeitUp belong in their own scraper files.
|--------------------------------------------------------------------------
*/

// Shadowmoss configuration
const SHADOWMOSS_CONFIG = {
  slug: "shadowmoss",
  type: "foreup",
  name: "Shadowmoss Golf Club",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 11335,
  schedule_id: 8813,
  schedule_ids: [8813],
};

// Charleston National
const CHARLESTON_NATIONAL_CONFIG = {
  slug: "charleston_national",
  type: "foreup",
  name: "Charleston National",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 9877,
  schedule_id: 7624,
  schedule_ids: [7624],
};

// Legend Oaks
const LEGEND_OAKS_CONFIG = {
  slug: "legend_oaks",
  type: "foreup",
  name: "Legend Oaks",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 50425,
  schedule_id: 11562,
  schedule_ids: [11562],
};

// Stono Ferry
const STONO_FERRY_CONFIG = {
  slug: "stono_ferry",
  type: "foreup",
  name: "Stono Ferry",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 3511,
  schedule_id: 3903,
  schedule_ids: [3903],
};

// Dunes West (ForeUp)
const DUNES_WEST_CONFIG = {
  slug: "dunes_west",
  type: "foreup",
  name: "Dunes West Golf Club",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 1953,
  schedule_id: 1953,
  schedule_ids: [1953],
};

// Jax Beach Golf Club
const JAX_BEACH_CONFIG = {
  slug: "jax_beach",
  type: "foreup",
  name: "Jax Beach Golf Club",
  baseUrl: "https://app.foreupsoftware.com/index.php/api/booking/times",
  booking_class: 10426,
  schedule_id: 2912,
  schedule_ids: [2912],
};

// Rivertowne (Quick18 – NOT ForeUp, but we include metadata here)
const RIVERTOWNE_CONFIG = {
  slug: "rivertowne",
  type: "quick18",
  name: "Rivertowne Country Club",
  baseUrl: "https://rivertowne.quick18.com",
};

/*
|--------------------------------------------------------------------------
| MASTER EXPORT: Course metadata only
|--------------------------------------------------------------------------
*/
const COURSE_CONFIGS = {
  shadowmoss: SHADOWMOSS_CONFIG,
  charleston_national: CHARLESTON_NATIONAL_CONFIG,
  legend_oaks: LEGEND_OAKS_CONFIG,
  stono_ferry: STONO_FERRY_CONFIG,
  dunes_west: DUNES_WEST_CONFIG,
  jax_beach: JAX_BEACH_CONFIG,
  rivertowne: RIVERTOWNE_CONFIG,
};

/*
|--------------------------------------------------------------------------
| FOREUP SCRAPER IMPLEMENTATION
|--------------------------------------------------------------------------
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

  config.schedule_ids.forEach((id) =>
    params.append("schedule_ids[]", String(id))
  );

  return `${config.baseUrl}?${params.toString()}`;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";

        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
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

function normalizeForeupTeeTime(raw, courseSlug, courseName) {
  const time = raw.time || raw.start_time || null;

  let price = null;
  if (typeof raw.green_fee_18 === "number") price = raw.green_fee_18;
  else if (typeof raw.green_fee === "number") price = raw.green_fee;
  else if (typeof raw.rate === "number") price = raw.rate;

  let availableSpots = null;
  if (typeof raw.available_spots_18 === "number")
    availableSpots = raw.available_spots_18;
  else if (typeof raw.available_spots === "number")
    availableSpots = raw.available_spots;

  return {
    courseSlug,
    courseName,
    time,
    price,
    availableSpots,
    raw,
  };
}

async function fetchForeUpTimesForCourse(slug, dateString) {
  const config = COURSE_CONFIGS[slug];

  if (!config || config.type !== "foreup") {
    throw new Error(`Requested non-ForeUp course in ForeUp scraper: ${slug}`);
  }

  const url = buildForeUpUrl(config, dateString);
  const raw = await fetchJson(url);

  let arr = raw;
  if (!Array.isArray(arr)) {
    if (arr && Array.isArray(arr.times)) arr = arr.times;
    else return [];
  }

  return arr.map((item) =>
    normalizeForeupTeeTime(item, slug, config.name)
  );
}

module.exports = {
  COURSE_CONFIGS,
  fetchForeUpTimesForCourse,
};