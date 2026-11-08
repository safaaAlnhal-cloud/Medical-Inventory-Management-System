import { addDays, addMonths, toISODate } from './dates';

export const DATE_RANGES = [
  { value: '30d', label: 'Last 30 Days', days: 30 },
  { value: '3m', label: 'Last 3 Months', months: 3 },
  { value: '6m', label: 'Last 6 Months', months: 6 },
];

export const DEFAULT_DATE_RANGE = '6m';

// Converts a range key into the ISO dates the reports service sends to the backend.
// Month ranges are calendar months back from today; both ends are inclusive.
export const resolveDateRange = (value, now = new Date()) => {
  const range = DATE_RANGES.find((option) => option.value === value) || DATE_RANGES[DATE_RANGES.length - 1];
  const from = range.months ? addMonths(now, -range.months) : addDays(now, -range.days);
  return { from: toISODate(from), to: toISODate(now) };
};

// Three lightness levels of the brand green #16423c (same hue), darkest first.
const DONUT_COLORS = ['#16423c', '#409689', '#9bd4cd'];
const DONUT_EMPTY_COLOR = '#e2f3f1';

// Builds the CSS conic-gradient for a donut chart from raw segment values.
export const buildDonutGradient = (values, colors = DONUT_COLORS) => {
  const amounts = values.map((value) => Math.max(0, Number(value) || 0));
  const total = amounts.reduce((sum, value) => sum + value, 0);
  if (total === 0) return DONUT_EMPTY_COLOR;

  let start = 0;
  const stops = amounts.map((value, index) => {
    const end = index === amounts.length - 1 ? 360 : start + (value / total) * 360;
    const stop = `${colors[index % colors.length]} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(', ')})`;
};

// Page numbers to show around the current page.
export const getPageWindow = (page, totalPages, size = 5) => {
  const first = Math.max(1, Math.min(page - Math.floor(size / 2), totalPages - size + 1));
  const last = Math.min(totalPages, first + size - 1);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
};
