import { ACCESS, isAccountExpired, MIN_PASSWORD_LENGTH, normalizeRole, ROLES, USER_STATUS } from '../constants/users';
import { toISODate } from '../utils/dates';
import { http } from './apiAxios';
import { ApiError, checkFields, fieldError } from './apiError';
import { commit, matchesSearch, nextId, requireCurrentUser } from './mock/mockDb';
import { selectUser } from './mock/mockSelectors';
import { request } from './request';

// Frontend user model: { id, name, email, role, status, phone, lastActiveAt, transactionsCount }
export const mapUser = (dto) => ({
  id: dto.id,
  name: dto.name,
  email: dto.email,
  role: normalizeRole(dto.role),
  status: String(dto.status ?? '').toLowerCase(),
  phone: dto.phone ?? '',
  lastActiveAt: dto.lastActiveAt ?? null,
  transactionsCount: Number(dto.transactionsCount) || 0,
  // The last day the account works ('YYYY-MM-DD'), or null: it never expires.
  accountExpiresOn: dto.accountExpiresOn ?? null,
  // Worked out by the backend: true once today is after accountExpiresOn (the "Expired" badge).
  accountExpired: Boolean(dto.accountExpired),
});

const mapDirectoryEntry = (dto) => ({ id: dto.id, name: dto.name });

// ---- Mock-side validation, shared with profileApi --------------------------------------------

// Something@something.something, with no spaces: like the backend's email:filter rule, it refuses
// an address with no dot after the @ ("ahmad@medcenter").
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The users table columns hold 255 characters (the backend's max:255).
export const MAX_TEXT_LENGTH = 255;

export const requireName = (value) => {
  const name = String(value ?? '').trim();
  if (!name) throw fieldError('name', 'Full name is required.');
  if (name.length > MAX_TEXT_LENGTH) throw fieldError('name', `Full name may not be longer than ${MAX_TEXT_LENGTH} characters.`);
  return name;
};

export const requireEmail = (value) => {
  const email = String(value ?? '').trim();
  if (!EMAIL_PATTERN.test(email)) throw fieldError('email', 'Please enter a valid email address.');
  if (email.length > MAX_TEXT_LENGTH) throw fieldError('email', `The email may not be longer than ${MAX_TEXT_LENGTH} characters.`);
  return email;
};

// 409 on "email" when another account already uses the address (any letter case).
const assertEmailFree = (db, email, exceptUserId = null) => {
  const taken = db.users.some((user) => user.id !== exceptUserId && user.email.toLowerCase() === email.toLowerCase());
  if (taken) throw fieldError('email', 'Another account already uses this email address.', 409);
};

// Returns the cleaned { name, email }: both fields are checked (422 lists every wrong one), then
// the address must be free (409). Shared with profileApi.
export const validateUserDetails = (db, { name, email }, exceptUserId = null) => {
  const details = checkFields({ name: () => requireName(name), email: () => requireEmail(email) });
  assertEmailFree(db, details.email, exceptUserId);
  return details;
};

export const requireNewPassword = (value, field = 'password') => {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) throw fieldError(field, `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > MAX_TEXT_LENGTH) throw fieldError(field, `The password may not be longer than ${MAX_TEXT_LENGTH} characters.`);
  return password;
};

// The shape of a date only ('YYYY-MM-DD', a real day). Whether it may be used is checkExpiryDate's job.
const requireDateShape = (value) => {
  if (value === null || value === '' || value === undefined) return null;
  const valid = DATE_PATTERN.test(String(value)) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
  if (!valid) throw fieldError('accountExpiresOn', 'Please enter a valid date.');
  return value;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// accountExpiresOn: null or a 'YYYY-MM-DD' that is not before today. The admin never expires.
// `current` is the date the account already has: sending it back unchanged is always allowed,
// even once it is in the past. Returns the cleaned value.
const checkExpiryDate = (user, value, current = null) => {
  if (requireDateShape(value) === null) return null;
  if (user.role === ROLES.ADMIN) throw fieldError('accountExpiresOn', 'The admin account cannot expire.');
  if (value !== current && value < toISODate()) throw fieldError('accountExpiresOn', 'The account expiry date cannot be in the past.');
  return value;
};

const findUser = (db, id) => {
  const user = db.users.find((candidate) => candidate.id === id);
  if (!user) throw new ApiError('This user no longer exists.', { status: 404 });
  return user;
};

// ---- Service -----------------------------------------------------------------------------------

export const getUsersApi = async ({ search = '' } = {}) => {
  const dtos = await request({
    access: ACCESS.ADMIN,
    api: () => http.get('/users', { params: { search: search || undefined } }),
    mock: (db) => db.users
      .filter((user) => matchesSearch([user.name, user.email, user.role, user.status, isAccountExpired(user, toISODate()) ? 'expired' : null], search))
      .map((user) => selectUser(db, user)),
  });
  return dtos.map(mapUser);
};

// Minimal { id, name } list, available to every signed-in user, for resolving userId references.
export const getUserDirectoryApi = async () => {
  const dtos = await request({
    api: () => http.get('/users/directory'),
    mock: (db) => db.users.map((user) => ({ id: user.id, name: user.name })),
  });
  return dtos.map(mapDirectoryEntry);
};

// Creates a storekeeper account. Payload: { name, email, password, accountExpiresOn }
// accountExpiresOn is optional: empty means the account never expires.
export const createUserApi = async ({ name, email, password, accountExpiresOn = null }) => {
  const dto = await request({
    access: ACCESS.ADMIN,
    api: () => http.post('/users', { name, email, password, role: ROLES.STOREKEEPER, accountExpiresOn: accountExpiresOn || null }),
    mock: (db) => {
      // Every field first (one 422 lists them all, like StoreUserRequest), then the free email (409).
      const valid = checkFields({
        name: () => requireName(name),
        email: () => requireEmail(email),
        password: () => requireNewPassword(password),
        accountExpiresOn: () => checkExpiryDate({ role: ROLES.STOREKEEPER }, accountExpiresOn),
      });
      assertEmailFree(db, valid.email);
      const user = {
        id: nextId(db.users),
        name: valid.name,
        email: valid.email,
        password: valid.password,
        role: ROLES.STOREKEEPER,
        status: USER_STATUS.ACTIVE,
        phone: '',
        lastActiveAt: null,
        accountExpiresOn: valid.accountExpiresOn,
      };
      db.users.push(user);
      commit();
      return selectUser(db, user);
    },
  });
  return mapUser(dto);
};

// Payload: { name, email, status, accountExpiresOn }. An admin cannot deactivate the account they
// are signed in with (409): that would lock the last signed-in admin out. accountExpiresOn is
// optional: left out (undefined), the date stays as it is; null or '' removes it.
export const updateUserApi = async (id, { name, email, status, accountExpiresOn }) => {
  const sendsDate = accountExpiresOn !== undefined;
  const dto = await request({
    access: ACCESS.ADMIN,
    api: () => http.put(`/users/${id}`, { name, email, status, ...(sendsDate && { accountExpiresOn: accountExpiresOn || null }) }),
    mock: (db) => {
      const user = findUser(db, id);
      // Like UpdateUserRequest: every field's shape at once (422), then the rules of UserService.
      const valid = checkFields({
        name: () => requireName(name),
        email: () => requireEmail(email),
        status: () => {
          if (!Object.values(USER_STATUS).includes(status)) throw fieldError('status', 'Please choose a valid account status.');
          return status;
        },
        accountExpiresOn: () => (sendsDate ? requireDateShape(accountExpiresOn) : undefined),
      });
      assertEmailFree(db, valid.email, id);
      const details = { name: valid.name, email: valid.email };
      if (status !== USER_STATUS.ACTIVE && user.id === requireCurrentUser().id) {
        throw fieldError('status', 'You cannot deactivate the account you are signed in with.', 409);
      }
      const expiry = sendsDate ? { accountExpiresOn: checkExpiryDate(user, accountExpiresOn, user.accountExpiresOn ?? null) } : {};
      Object.assign(user, details, { status }, expiry);
      commit();
      return selectUser(db, user);
    },
  });
  return mapUser(dto);
};

// Admin sets a new password for another account (there is no self-service "forgot password"
// by email). Payload: { newPassword }. Resolves with nothing on success.
export const resetUserPasswordApi = async (id, { newPassword }) => {
  await request({
    access: ACCESS.ADMIN,
    api: () => http.put(`/users/${id}/password`, { newPassword }),
    mock: (db) => {
      const user = findUser(db, id);
      user.password = requireNewPassword(newPassword, 'newPassword');
      commit();
    },
  });
};
