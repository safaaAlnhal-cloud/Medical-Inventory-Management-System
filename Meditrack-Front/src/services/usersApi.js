import { ACCESS, MIN_PASSWORD_LENGTH, normalizeRole, ROLES, USER_STATUS } from '../constants/users';
import { http } from './apiAxios';
import { ApiError, fieldError } from './apiError';
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
});

const mapDirectoryEntry = (dto) => ({ id: dto.id, name: dto.name });

// ---- Mock-side validation, shared with profileApi --------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns the cleaned { name, email }, or throws with a message for the field at fault.
export const validateUserDetails = (db, { name, email }, exceptUserId = null) => {
  const cleanName = String(name ?? '').trim();
  const cleanEmail = String(email ?? '').trim();
  if (!cleanName) throw fieldError('name', 'Full name is required.');
  if (!EMAIL_PATTERN.test(cleanEmail)) throw fieldError('email', 'Please enter a valid email address.');
  const taken = db.users.some((user) => user.id !== exceptUserId && user.email.toLowerCase() === cleanEmail.toLowerCase());
  if (taken) throw fieldError('email', 'Another account already uses this email address.', 409);
  return { name: cleanName, email: cleanEmail };
};

export const requireNewPassword = (value, field = 'password') => {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) throw fieldError(field, `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  return password;
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
      .filter((user) => matchesSearch([user.name, user.email, user.role, user.status], search))
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

// Creates a storekeeper account. Payload: { name, email, password }
export const createUserApi = async ({ name, email, password }) => {
  const dto = await request({
    access: ACCESS.ADMIN,
    api: () => http.post('/users', { name, email, password, role: ROLES.STOREKEEPER }),
    mock: (db) => {
      const details = validateUserDetails(db, { name, email });
      const user = {
        id: nextId(db.users),
        ...details,
        password: requireNewPassword(password),
        role: ROLES.STOREKEEPER,
        status: USER_STATUS.ACTIVE,
        phone: '',
        lastActiveAt: null,
      };
      db.users.push(user);
      commit();
      return selectUser(db, user);
    },
  });
  return mapUser(dto);
};

// Payload: { name, email, status }. An admin cannot deactivate the account they are signed in
// with (409): that would lock the last signed-in admin out.
export const updateUserApi = async (id, { name, email, status }) => {
  const dto = await request({
    access: ACCESS.ADMIN,
    api: () => http.put(`/users/${id}`, { name, email, status }),
    mock: (db) => {
      const user = findUser(db, id);
      const details = validateUserDetails(db, { name, email }, id);
      if (!Object.values(USER_STATUS).includes(status)) throw fieldError('status', 'Please choose a valid account status.');
      if (status !== USER_STATUS.ACTIVE && user.id === requireCurrentUser().id) {
        throw fieldError('status', 'You cannot deactivate the account you are signed in with.', 409);
      }
      Object.assign(user, details, { status });
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
