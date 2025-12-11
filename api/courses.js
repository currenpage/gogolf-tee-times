// api/courses.js

const { COURSE_CONFIGS } = require("../scrapers/foreup");

/*
  NOTE:
  These must stay in sync with api/tee-times.js.
  If you add a new Quick18 / TeeitUp / GolfBack course there,
  add it here too.
*/

// Quick18-backed courses with coordinates
const QUICK18_COURSES = {
  rivertowne: {
    baseUrl: "https://rivertowne.quick18.com",
    name: "Rivertowne Country Club",
    latitude: 32.9447,
    longitude: -80.0547,
  },
  dunes_west: {
    baseUrl: "https://duneswest.quick18.com",
    name: "Dunes West Golf Club",
    latitude: 32.9158,
    longitude: -80.0025,
  },
};

// TeeitUp-backed courses with coordinates
const TEEITUP_META = {
  santee_national: {
    name: "Santee National Golf Club",
    latitude: 33.4858,
    longitude: -80.4919,
  },
  stillwater: {
    name: "Stillwater Golf and Country Club",
    latitude: 30.1294,
    longitude: -81.8669,
  },
  hidden_hills: {
    name: "Hidden Hills Golf Club",
    latitude: 30.1656,
    longitude: -81.8558,
  },
  blue_cypress: {
    name: "Blue Cypress Golf Club",
    latitude: 30.2053,
    longitude: -81.6836,
  },
};

// GolfBack-backed courses with coordinates
const GOLFBACK_META = {
  windsor_parke: {
    name: "Windsor Parke Golf Club",
    latitude: 30.0925,
    longitude: -81.7453,
  },
  julington_creek: {
    name: "Julington Creek Golf Club",
    latitude: 30.0781,
    longitude: -81.6386,
  },
};

// Coordinates for ForeUp courses (will be merged with COURSE_CONFIGS)
const FOREUP_COORDINATES = {
  shadowmoss: { latitude: 32.8953, longitude: -80.1061 },
  charleston_national: { latitude: 32.8747, longitude: -80.0381 },
  legend_oaks: { latitude: 32.9814, longitude: -80.2069 },
  stono_ferry: { latitude: 32.7069, longitude: -80.2653 },
  jax_beach: { latitude: 30.2872, longitude: -81.3947 },
};

module.exports = (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // ForeUp courses (from scrapers/foreup.js) with added coordinates
  const foreupCourses = Object.keys(COURSE_CONFIGS)
    .filter((slug) => COURSE_CONFIGS[slug].type === "foreup")
    .map((slug) => ({
      slug,
      name: COURSE_CONFIGS[slug].name,
      provider: "foreup",
      latitude: FOREUP_COORDINATES[slug]?.latitude || null,
      longitude: FOREUP_COORDINATES[slug]?.longitude || null,
    }));

  // Quick18 courses
  const quick18Courses = Object.entries(QUICK18_COURSES).map(
    ([slug, cfg]) => ({
      slug,
      name: cfg.name,
      provider: "quick18",
      latitude: cfg.latitude,
      longitude: cfg.longitude,
    })
  );

  // TeeitUp courses
  const teeitupCourses = Object.entries(TEEITUP_META).map(
    ([slug, cfg]) => ({
      slug,
      name: cfg.name,
      provider: "teeitup",
      latitude: cfg.latitude,
      longitude: cfg.longitude,
    })
  );

  // GolfBack courses
  const golfbackCourses = Object.entries(GOLFBACK_META).map(
    ([slug, cfg]) => ({
      slug,
      name: cfg.name,
      provider: "golfback",
      latitude: cfg.latitude,
      longitude: cfg.longitude,
    })
  );

  const courses = [
    ...foreupCourses,
    ...quick18Courses,
    ...teeitupCourses,
    ...golfbackCourses,
  ];

  res.status(200).json({ courses });
};