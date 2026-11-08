import { daysBetween, parseDate } from './dates';

export const EMPTY_VALUE = '—';

const pad = (value) => String(value).padStart(2, '0');
const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

export const formatDate = (value) => {
  const date = parseDate(value);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : EMPTY_VALUE;
};

// "Today, 10:15 AM" / "Yesterday, 03:40 PM" / "05/10/2026, 09:20 AM"
export const formatDateTime = (value, now = new Date()) => {
  const date = parseDate(value);
  if (!date) return EMPTY_VALUE;
  const age = daysBetween(date, now);
  if (age === 0) return `Today, ${formatTime(date)}`;
  if (age === 1) return `Yesterday, ${formatTime(date)}`;
  return `${formatDate(date)}, ${formatTime(date)}`;
};

export const formatRelativeTime = (value, now = new Date()) => {
  const date = parseDate(value);
  if (!date) return EMPTY_VALUE;
  const minutes = Math.floor((now - date) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = daysBetween(date, now);
  if (days <= 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(date);
};

// "2026-05" -> "May"
export const formatMonth = (monthKey) => {
  const date = parseDate(`${monthKey}-01`);
  return date ? date.toLocaleDateString('en-US', { month: 'short' }) : EMPTY_VALUE;
};

export const formatNumber = (value) => (Number(value) || 0).toLocaleString('en-US');

// The one place the currency is defined. Change it here if the project settles on another one.
export const CURRENCY_SYMBOL = '$';

export const formatCurrency = (value) =>
  `${CURRENCY_SYMBOL}${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatUnit = (unit) => (unit ? unit.charAt(0).toUpperCase() + unit.slice(1) : EMPTY_VALUE);

const pluralizeUnit = (unit, count) => {
  if (!unit) return count === 1 ? 'unit' : 'units';
  if (count === 1) return unit;
  return unit.endsWith('x') ? `${unit}es` : `${unit}s`;
};

// formatQuantity(15, 'box') -> "15 boxes"
export const formatQuantity = (quantity, unit) => `${formatNumber(quantity)} ${pluralizeUnit(unit, Number(quantity))}`;

export const getInitial = (name) => (name || '?').trim().charAt(0).toUpperCase();
