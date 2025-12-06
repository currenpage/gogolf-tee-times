// utils/scraper-helpers.js

/**
 * Wraps a promise with a timeout.
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} - Resolves/rejects with original promise or times out
 */
function withTimeout(promise, timeoutMs = 8000) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]);
}

/**
 * Retries a function on failure.
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts (default 1)
 * @param {number} delayMs - Delay between retries in ms (default 1000)
 * @returns {Promise} - Result of successful attempt or final error
 */
async function withRetry(fn, maxRetries = 1, delayMs = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx)
      if (error.message && error.message.includes("HTTP 4")) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}

/**
 * Validates that a scraper response is an array of valid tee times.
 * @param {any} data - Response from scraper
 * @returns {Array} - Validated and filtered tee times
 */
function validateTeeTimeResponse(data) {
  if (!Array.isArray(data)) {
    console.warn("Scraper response is not an array:", typeof data);
    return [];
  }
  
  return data.filter(tt => {
    // Must have these required fields
    if (!tt || typeof tt !== "object") return false;
    if (!tt.courseSlug || typeof tt.courseSlug !== "string") return false;
    if (!tt.courseName || typeof tt.courseName !== "string") return false;
    if (!tt.time) return false;
    
    return true;
  });
}

/**
 * Creates a structured error log object.
 * @param {string} course - Course slug
 * @param {string} provider - Provider name (foreup, quick18, etc)
 * @param {Error} error - The error object
 * @param {number} durationMs - Operation duration in ms
 * @returns {Object} - Structured log object
 */
function createErrorLog(course, provider, error, durationMs = null) {
  const log = {
    level: "error",
    course,
    provider,
    operation: "scrape",
    error: error.message || String(error),
    timestamp: new Date().toISOString(),
  };
  
  if (durationMs !== null) {
    log.duration_ms = durationMs;
  }
  
  return log;
}

/**
 * Wraps a scraper function with timeout, retry, and validation.
 * @param {Function} scraperFn - The scraper function to wrap
 * @param {string} courseSlug - Course identifier
 * @param {string} provider - Provider name
 * @returns {Promise<Object>} - { success: boolean, data: Array, error: string|null }
 */
async function executeScraper(scraperFn, courseSlug, provider) {
  const startTime = Date.now();
  
  try {
    const result = await withRetry(
      () => withTimeout(scraperFn(), 8000),
      1, // retry once
      1000 // 1 second delay
    );
    
    const validated = validateTeeTimeResponse(result);
    const duration = Date.now() - startTime;
    
    console.log(JSON.stringify({
      level: "info",
      course: courseSlug,
      provider,
      operation: "scrape",
      success: true,
      teeTimesCount: validated.length,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }));
    
    return {
      success: true,
      data: validated,
      error: null,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorLog = createErrorLog(courseSlug, provider, error, duration);
    
    console.error(JSON.stringify(errorLog));
    
    return {
      success: false,
      data: [],
      error: error.message || String(error),
    };
  }
}

module.exports = {
  withTimeout,
  withRetry,
  validateTeeTimeResponse,
  createErrorLog,
  executeScraper,
};