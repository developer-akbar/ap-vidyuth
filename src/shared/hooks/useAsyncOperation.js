import { useState, useCallback, useEffect } from 'react';
import { retryWithBackoff, logError } from '../utils/errorHandling.js';

/**
 * useAsyncOperation Hook
 * 
 * Manages loading, error, and success states for async operations
 * with built-in retry capability and proper error handling.
 * 
 * Usage:
 * const { data, error, loading, retry } = useAsyncOperation(
 *   () => fetchBills(serviceId),
 *   { context: '[BillsList]' }
 * );
 * 
 * if (loading) return <Loader />;
 * if (error) return <ErrorState onRetry={retry} />;
 * if (!data) return <EmptyState />;
 * return <BillsTable bills={data} />;
 */
export function useAsyncOperation(
  asyncFn,
  options = {}
) {
  const {
    context = '[useAsyncOperation]',
    autoExecute = true,
    maxRetries = 3,
    retryDelays = [0, 2000, 5000],
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState({
    data: null,
    error: null,
    loading: autoExecute,
    retryCount: 0,
  });

  /**
   * Execute the async operation
   */
  const execute = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));

    try {
      const result = await retryWithBackoff(
        asyncFn,
        maxRetries,
        retryDelays
      );

      setState(s => ({
        ...s,
        data: result,
        error: null,
        loading: false,
        retryCount: 0,
      }));

      onSuccess?.(result);
    } catch (error) {
      logError(
        context,
        'Async operation failed after retries',
        error,
        { maxRetries, asyncFn: asyncFn.name }
      );

      setState(s => ({
        ...s,
        error,
        loading: false,
        retryCount: s.retryCount + 1,
      }));

      onError?.(error);
    }
  }, [asyncFn, maxRetries, retryDelays, context, onSuccess, onError]);

  /**
   * Retry the operation
   */
  const retry = useCallback(() => {
    execute();
  }, [execute]);

  /**
   * Auto-execute on mount if enabled
   */
  useEffect(() => {
    if (autoExecute) {
      execute();
    }
  }, [autoExecute]); // Only run on mount

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    retryCount: state.retryCount,
    execute,
    retry,
    isSuccess: state.data !== null && state.error === null,
    isError: state.error !== null,
    isLoading: state.loading,
  };
}

/**
 * useLazyAsyncOperation Hook
 * 
 * Like useAsyncOperation but doesn't auto-execute.
 * Perfect for operations triggered by user action.
 * 
 * Usage:
 * const { execute, data, error, loading } = useLazyAsyncOperation(
 *   () => saveService(formData)
 * );
 * 
 * return (
 *   <>
 *     <form onSubmit={() => execute()}>
 *       {error && <ErrorState message={error.message} />}
 *       {loading && <Loader />}
 *     </form>
 *   </>
 * );
 */
export function useLazyAsyncOperation(asyncFn, options = {}) {
  return useAsyncOperation(asyncFn, {
    ...options,
    autoExecute: false,
  });
}

/**
 * useAsyncOperationWithCache Hook
 * 
 * Extends useAsyncOperation with local caching support
 * Useful for avoiding redundant API calls
 * 
 * Usage:
 * const { data, loading, error } = useAsyncOperationWithCache(
 *   () => fetchUserProfile(userId),
 *   { cacheKey: `profile-${userId}`, cacheTime: 5 * 60 * 1000 }
 * );
 */
export function useAsyncOperationWithCache(asyncFn, options = {}) {
  const {
    cacheKey,
    cacheTime = 5 * 60 * 1000, // 5 minutes default
    ...restOptions
  } = options;

  const [cache, setCache] = useState({});

  const wrappedFn = useCallback(async () => {
    // Return cached data if available and not expired
    if (cacheKey && cache[cacheKey]) {
      const { data, timestamp } = cache[cacheKey];
      if (Date.now() - timestamp < cacheTime) {
        return data;
      }
    }

    // Fetch fresh data
    const result = await asyncFn();

    // Store in cache
    if (cacheKey) {
      setCache(prev => ({
        ...prev,
        [cacheKey]: {
          data: result,
          timestamp: Date.now(),
        },
      }));
    }

    return result;
  }, [asyncFn, cacheKey, cache, cacheTime]);

  const operation = useAsyncOperation(wrappedFn, restOptions);

  return {
    ...operation,
    clearCache: useCallback(() => {
      if (cacheKey) {
        setCache(prev => {
          const newCache = { ...prev };
          delete newCache[cacheKey];
          return newCache;
        });
      }
    }, [cacheKey]),
  };
}
