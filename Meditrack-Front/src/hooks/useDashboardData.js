import { useCallback } from 'react';
import { useAsyncData } from './useAsyncData';

// Loads the independent sections of a dashboard together.
//   sections: { [name]: { load: () => Promise<value>, empty: value, label: 'recent transactions' } }
//             It must be stable (built with useMemo); when it changes everything loads again.
// Returns { data: { [name]: value }, failed: [label, ...], loading, error, reload }.
// A section that fails keeps its `empty` value and is listed in `failed`; the other sections
// still show their data, so one failing request never blanks the whole dashboard.
export const useDashboardData = (sections) => {
  const loadSections = useCallback(async () => {
    const names = Object.keys(sections);
    const results = await Promise.allSettled(names.map((name) => sections[name].load()));
    const data = {};
    const failed = [];
    let firstError = null;
    results.forEach((result, index) => {
      const section = sections[names[index]];
      if (result.status === 'fulfilled') {
        data[names[index]] = result.value;
      } else {
        data[names[index]] = section.empty;
        failed.push(section.label);
        firstError = firstError ?? result.reason;
      }
    });
    // Nothing loaded at all: report it as one ordinary error.
    if (failed.length === names.length && firstError) throw firstError;
    return { data, failed };
  }, [sections]);

  const { data: loaded, loading, error, reload } = useAsyncData(loadSections, null);

  const emptyData = Object.fromEntries(Object.entries(sections).map(([name, section]) => [name, section.empty]));
  const partialError = loaded?.failed.length
    ? `Some dashboard data could not be loaded (${loaded.failed.join(', ')}). The rest is up to date.`
    : null;

  return { data: loaded?.data ?? emptyData, loading, error: error || partialError, reload };
};
