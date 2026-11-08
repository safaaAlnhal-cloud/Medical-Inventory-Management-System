import { addDays, toISODate } from '../utils/dates';

// Seed dates are relative to "now" so the demo data never goes stale
// (expiry warnings, "today" transactions and the 6-month chart stay meaningful).
export const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000);

export const daysAgo = (days, hour = 10, minute = 0) => {
  const date = addDays(new Date(), -days);
  date.setHours(hour, minute, 0, 0);
  return date;
};

export const isoDateFromNow = (days) => toISODate(addDays(new Date(), days));
