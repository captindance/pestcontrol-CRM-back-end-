/**
 * Logging utility - only logs in development mode
 * Prevents sensitive information from appearing in production logs
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = {
  /**
   * Log informational messages (development only)
   */
  log(...args: any[]) {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log warning messages (development only)
   */
  warn(...args: any[]) {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Log error messages (always logged)
   */
  error(...args: any[]) {
    console.error(...args);
  },

  /**
   * Log debug messages (development only)
   */
  debug(...args: any[]) {
    if (isDevelopment) {
      console.debug(...args);
    }
  },

  /**
   * Log SSE events (development only)
   */
  sse(...args: any[]) {
    if (isDevelopment) {
      console.log('[SSE]', ...args);
    }
  },

  /**
   * Log request information (development only)
   */
  request(...args: any[]) {
    if (isDevelopment) {
      console.log('[req]', ...args);
    }
  }
};
