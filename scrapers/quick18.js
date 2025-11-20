// scrapers/quick18.js

const https = require("https");
const cheerio = require("cheerio");

/**
 * Fetch HTML page
 */
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", (err) => reject(err));
  });
}

/**
 * Quick18 URLs require YYYYMMDD instead of YYYY-MM-DD
 */
function buildQuick18Url(baseUrl, dateString) {
  const compact = dateString.replace(/-/g, ""); // "2025-11-20" → "20251120"
  return `${baseUrl}/teetimes/searchmatrix?teedate=${compact}`;
}

/**
 * Parse Quick18 encoded time: 202511201212 → "2025-11-20 12:12"
 */
function parseQuick18TimeCode(code) {
  if (!/^\d{12}$/.test(code)) return null;
  const year = code.slice(0, 4);
  const month = code.slice(4, 6);
  const day = code.slice(6, 8);
  const hour = code.slice(8, 10);
  const min = code.slice(10, 12);
  return `${year}-${month}-${day} ${hour}:${min}`;
}

/**
 * Scrape all tee times for a Quick18 course
 */
async function fetchQuick18TeeTimes(baseUrl, courseSlug, courseName, dateString) {
  const url = buildQuick18Url(baseUrl, dateString);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const teeTimes = [];

  $("td.matrixsched").each((_, el) => {
    const cell = $(el);

    // Price
    const priceText = cell.find(".mtrxPrice").text().trim();
    const numericPrice = priceText.replace(/[^0-9.]/g, "");
    const price = numericPrice ? parseFloat(numericPrice) : null;

    // Tee time (encoded in the select link)
    const link = cell.find("a.sexybutton.teebutton").attr("href") || "";
    const match = link.match(/\/teetime\/(\d{12})/);
    const code = match ? match[1] : null;
    const time = code ? parseQuick18TimeCode(code) : null;

    if (time) {
      teeTimes.push({
        courseSlug,
        courseName,
        time,
        price,
        bookingUrl: `${baseUrl}${link}`,
        raw: { priceText, link, code },
      });
    }
  });

  return teeTimes;
}

module.exports = {
  fetchQuick18TeeTimes,
};