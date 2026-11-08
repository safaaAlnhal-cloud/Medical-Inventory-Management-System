import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../services/apiError';

// Loads data from a service and tracks loading / error state.
//   fetcher: a stable function (module-level or wrapped in useCallback). When its identity
//            changes (i.e. its inputs changed) the data is loaded again.
// Returns { data, loading, error, reload, setData }.
//   loading: true while a new fetcher is loading. `reload()` refreshes quietly in the background.
//   error:   a user-friendly message, or null.
export const useAsyncData = (fetcher, initialData = null) => {
  const [initial] = useState(initialData);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState({ source: null, data: initial, error: null });

  useEffect(() => {
    let active = true;
    fetcher()
      .then((data) => { if (active) setResult({ source: fetcher, data, error: null }); })
      .catch((error) => {
        if (active) setResult((previous) => ({ source: fetcher, data: previous.source === fetcher ? previous.data : initial, error: getErrorMessage(error) }));
      });
    return () => { active = false; };
  }, [fetcher, reloadCount, initial]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  const setData = useCallback((update) => {
    setResult((previous) => ({ ...previous, data: typeof update === 'function' ? update(previous.data) : update }));
  }, []);

  const loading = result.source !== fetcher;
  // While a new fetcher loads, `data` still holds the previous result so pages can avoid flicker.
  return { data: result.data, loading, error: loading ? null : result.error, reload, setData };
};
