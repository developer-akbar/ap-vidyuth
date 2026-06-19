/**
 * Error Handling & Recovery Utilities
 * 
 * Provides standardized error handling, logging, and retry mechanisms
 * following graceful degradation standards.
 */

/**
 * Log an error with context
 * @param {string} context - Where the error occurred (e.g., '[ElectricityDashboard]')
 * @param {string} action - What action failed (e.g., 'Bill fetch error')
 * @param {Error|Object} error - The error object
 * @param {Object} metadata - Additional context (serviceId, userId, etc.)
 */
export function logError(context, action, error, metadata = {}) {
  const errorInfo = {
    context,
    action,
    message: error?.message || String(error),
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  // Only include stack in development
  if (process.env.NODE_ENV === 'development') {
    errorInfo.stack = error?.stack;
  }

  console.error(`${context} ${action}`, errorInfo);

  // TODO: Send to external logging service (Sentry, LogRocket, etc.)
  // if (window.sentryClient) {
  //   window.sentryClient.captureException(error, { extra: errorInfo });
  // }
}

/**
 * Exponential backoff retry strategy
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Max retry attempts (default: 3)
 * @param {Array<number>} delays - Delay in ms between retries (default: [0, 2000, 5000])
 * @returns {Promise} Result of function execution
 */
export async function retryWithBackoff(
  fn,
  maxRetries = 3,
  delays = [0, 2000, 5000]
) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries - 1;

      logError(
        '[retryWithBackoff]',
        `Attempt ${attempt + 1}/${maxRetries} failed`,
        error,
        { isLastAttempt, nextRetryIn: delays[attempt] }
      );

      if (isLastAttempt) break;

      // Abort retrying for unrecoverable client/validation errors
      if (!isRecoverableError(error)) {
        break;
      }

      // Wait before next retry
      const delay = delays[attempt] || 0;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * User-friendly error message based on error type
 * @param {Error|Object} error - The error object
 * @param {string} fallback - Fallback message if error type unknown
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const message = error?.message || String(error);

  // Network errors
  if (message.includes('Network') || message.includes('fetch')) {
    return 'Unable to connect. Please check your internet connection.';
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('Timeout')) {
    return 'This took longer than expected. Please try again.';
  }

  // JSON parse errors (malformed response)
  if (message.includes('JSON') || message.includes('Unexpected token')) {
    return 'Received invalid data. Please try again.';
  }

  // Rate limit errors
  if (message.includes('429') || message.includes('Too Many Requests')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Authorization errors
  if (message.includes('401') || message.includes('Unauthorized')) {
    return 'You need to log in again.';
  }

  // Permission errors
  if (message.includes('403') || message.includes('Forbidden')) {
    return "You don't have permission to access this.";
  }

  // Not found errors
  if (message.includes('404') || message.includes('Not Found')) {
    return 'This data is no longer available.';
  }

  // Server errors
  if (message.includes('500') || message.includes('Server')) {
    return 'Server error. Please try again later.';
  }

  return fallback;
}

/**
 * Check if error is recoverable (retry-worthy)
 * @param {Error|Object} error - The error object
 * @returns {boolean} Whether error is recoverable
 */
export function isRecoverableError(error) {
  const message = error?.message || String(error);

  // Definitely recoverable
  if (message.includes('Network') || message.includes('timeout')) return true;
  if (message.includes('502') || message.includes('503') || message.includes('504')) return true;

  // Not recoverable (likely user error or permanent failure)
  if (message.includes('400') || message.includes('Bad Request')) return false;
  if (message.includes('401') || message.includes('Unauthorized')) return false;
  if (message.includes('403') || message.includes('Forbidden')) return false;
  if (message.includes('404') || message.includes('Not Found')) return false;

  // Default to true for unknown errors
  return true;
}

/**
 * Safe JSON parse with fallback
 * @param {string} json - JSON string to parse
 * @param {*} fallback - Fallback value if parse fails
 * @returns {*} Parsed object or fallback
 */
export function safeJsonParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch (e) {
    logError(
      '[safeJsonParse]',
      'JSON parse failed',
      e,
      { input: json?.substring(0, 100) }
    );
    return fallback;
  }
}

/**
 * Safe async operation with error handling
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Configuration
 * @returns {Object} { data, error, isLoading }
 */
export async function safeAsync(fn, options = {}) {
  const { context = '[safeAsync]', logError: shouldLog = true } = options;

  try {
    const data = await fn();
    return { data, error: null, isLoading: false };
  } catch (error) {
    if (shouldLog) {
      logError(context, 'Operation failed', error);
    }
    return { data: null, error, isLoading: false };
  }
}

/**
 * Timeout wrapper for promises
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} timeoutMessage - Custom timeout message
 * @returns {Promise} Promise that rejects on timeout
 */
export function withTimeout(promise, ms = 10000, timeoutMessage = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), ms)
    ),
  ]);
}
