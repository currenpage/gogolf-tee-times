// api/courses.js

const { COURSE_CONFIGS } = require("../scrapers/foreup");

/*
  NOTE:
  These must stay in sync with api/tee-times.js.
  If you add a new Quick18 / TeeitUp / GolfBack course there,
  add it here too.
*/

// Quick18-backed courses
const QUICK18_COURSES = {
  rivertowne: {
    baseUrl: "https://rivertowne.quick18.com",
    name: "Rivertowne Country Club",
  },
  dunes_west: {
    baseUrl: "https://duneswest.quick18.com",
    name: "Dunes West Golf Club",
  },
};

// TeeitUp-backed courses
const TEEITUP_META = {
  santee_national: {
    name: "Santee National Golf Club",
  },
  stillwater: {
    name: "Stillwater Golf and Country Club",
  },
};

// GolfBack-backed courses
const GOLFBACK_META = {
  windsor_parke: {
    name: "Windsor Parke Golf Club",
  },
};

module.exports = (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // ForeUp courses (from scrapers/foreup.js)
  const foreupCourses = Object.keys(COURSE_CONFIGS)
    .filter((slug) => COURSE_CONFIGS[slug].type === "foreup")
    .map((slug) => ({
      slug,
      name: COURSE_CONFIGS[slug].name,
      provider: "foreup",
    }));

  // Quick18 courses
  const quick18Courses = Object.entries(QUICK18_COURSES).map(
    ([slug, cfg]) => ({
      slug,
      name: cfg.name,
      provider: "quick18",
    })
  );

  // TeeitUp courses
  const teeitupCourses = Object.entries(TEEITUP_META).map(
    ([slug, cfg]) => ({
      slug,
      name: cfg.name,
      provider: "teeitup",
    })
  );

  // GolfBack courses
  const golfbackCourses = Object.entries(GOLFBACK_META).map(
    ([slug, cfg]) => ({
      slug,
      name: cfg.name,
      provider: "golfback",
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