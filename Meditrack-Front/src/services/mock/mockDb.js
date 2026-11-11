import { mockBatches } from '../../mockData/batchesMock';
import { mockCategories } from '../../mockData/categoriesMock';
import { mockInventoryItems } from '../../mockData/inventoryMock';
import { mockManufacturers } from '../../mockData/manufacturersMock';
import { mockTransactions } from '../../mockData/transactionsMock';
import { mockUsers } from '../../mockData/usersMock';
import { ACCESS, ROLES, USER_STATUS } from '../../constants/users';
import { ApiError } from '../apiError';
import { getStoredToken } from '../authStorage';
import { seedNotificationState, syncNotifications } from './mockSelectors';

// In-memory stand-in for the backend database. It is seeded from src/mockData and kept in
// sessionStorage, so changes survive a page refresh and reset when the browser tab is closed.
// Only services may import this module; pages and components never touch it.
// Bump the version whenever the seed data shape changes, so stale stored copies are dropped.
const STORAGE_KEY = 'meditrack.mockDb.v7';

const clone = (value) => JSON.parse(JSON.stringify(value));

const seed = () => {
  const db = {
    users: clone(mockUsers),
    categories: clone(mockCategories),
    manufacturers: clone(mockManufacturers),
    items: clone(mockInventoryItems),
    batches: clone(mockBatches),
    transactions: clone(mockTransactions),
    notificationState: {},
  };
  seedNotificationState(db);
  return db;
};

const load = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return stored?.users && stored?.manufacturers && stored?.items && stored?.batches && stored?.transactions ? stored : null;
  } catch {
    return null;
  }
};

let db = null;

export const getDb = () => {
  if (!db) db = load() || seed();
  return db;
};

// Throws the mock database away so the next request starts again from the seed data.
// Used by scripts/service-checks.mjs; the app itself never calls it.
export const resetMockDb = () => {
  db = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is unavailable: there is nothing stored to remove.
  }
};

// Call after every mutation.
export const commit = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(getDb()));
  } catch {
    // Storage is unavailable: the mock database stays in memory only.
  }
};

// Mock-only token: it is not signed and carries no security. The real backend issues a JWT.
const MOCK_TOKEN_PREFIX = 'mock-token-';
export const createMockToken = (userId) => `${MOCK_TOKEN_PREFIX}${userId}`;

// Runs a change that touches several records on a copy of the database, like a database
// transaction. The copy replaces the database only when `work` finishes; if it throws, nothing
// has changed, so a rejected change can never be half applied.
export const transact = (work) => {
  const draft = clone(getDb());
  const result = work(draft);
  db = draft;
  commit();
  return result;
};

// The signed-in user, identified from the bearer token the way the backend will do it.
export const requireCurrentUser = () => {
  const token = getStoredToken() ?? '';
  const userId = token.startsWith(MOCK_TOKEN_PREFIX) ? token.slice(MOCK_TOKEN_PREFIX.length) : null;
  const user = userId === null ? null : getDb().users.find((candidate) => String(candidate.id) === userId);
  if (!user) throw new ApiError('Your session has expired. Please sign in again.', { status: 401 });
  // A deactivated account loses its session: 401, so the frontend signs the user out.
  if (user.status !== USER_STATUS.ACTIVE) throw new ApiError('This account has been deactivated. Please contact an administrator.', { status: 401 });
  return user;
};

// MOCK ONLY. Stands in for the backend's authentication and role checks, so the 401 / 403
// paths can be exercised. It is not security: the mock token is unsigned and all of this runs
// in the browser. The real backend must enforce the same rules itself.
export const authorize = (access) => {
  if (access === ACCESS.PUBLIC) return null;
  const user = requireCurrentUser();
  if (access === ACCESS.ADMIN && user.role !== ROLES.ADMIN) throw new ApiError('You do not have permission to perform this action.', { status: 403 });
  return user;
};

// The current alerts with the signed-in user's own read state.
export const readNotifications = () => {
  const { list, changed } = syncNotifications(getDb(), requireCurrentUser().id);
  if (changed) commit();
  return list;
};

export const nextId = (rows) => rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;

export const mockDelay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

// Plays the role of the backend's ?search= filter.
export const matchesSearch = (values, query = '') => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value != null && String(value).toLowerCase().includes(normalized));
};
