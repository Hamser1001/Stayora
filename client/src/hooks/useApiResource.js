import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small data-fetching hook: loading / error / empty states plus manual reload.
 * Guards against out-of-order responses when filters change quickly.
 */
export function useApiResource(fetcher, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    requestId.current += 1;
    const current = requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (current === requestId.current) setData(result);
      return result;
    } catch (err) {
      if (current === requestId.current) setError(err);
      return null;
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: run, setData };
}
