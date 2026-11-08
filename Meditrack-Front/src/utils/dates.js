const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (value) => String(value).padStart(2, '0');

// Date-only ISO strings (YYYY-MM-DD) are read as local dates, not UTC midnight.
export const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const toISODate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const toMonthKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

// Whole calendar days from `from` to `to` (negative when `to` is earlier).
export const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);

export const daysUntil = (value, now = new Date()) => {
  const date = parseDate(value);
  return date ? daysBetween(now, date) : null;
};

export const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

// Calendar months: 31 May minus 3 months is the last day of February, not 3 March.
export const addMonths = (date, months) => {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), lastDay));
  return next;
};
