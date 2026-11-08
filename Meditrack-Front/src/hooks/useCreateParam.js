import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEFAULT_VALUES = ['1'];

// Handles the quick actions (sidebar and dashboards), which link to a page with ?create=1.
// Calls `onCreate` once and removes the parameter, so a refresh does not reopen the modal
// and clicking the quick action again triggers it again.
//   values: the ?create= values the page accepts (a stable array). `onCreate` receives the one
//           that was used, for pages with more than one form (e.g. ?create=incoming).
export const useCreateParam = (onCreate, values = DEFAULT_VALUES) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get('create');
  const shouldCreate = values.includes(value);

  useEffect(() => {
    if (!shouldCreate) return;
    onCreate(value);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('create');
      return next;
    }, { replace: true });
  }, [shouldCreate, value, onCreate, setSearchParams]);
};
