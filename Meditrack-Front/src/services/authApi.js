import { ACCESS, accountExpiredMessage, isAccountExpired, normalizeRole, USER_STATUS } from '../constants/users';
import { toISODate } from '../utils/dates';
import { http } from './apiAxios';
import { ApiError, checkFields, fieldError } from './apiError';
import { commit, createMockToken, requireCurrentUser } from './mock/mockDb';
import { request } from './request';
import { EMAIL_PATTERN, MAX_TEXT_LENGTH } from './usersApi';

// The signed-in user as the app keeps it: { id, name, email, role }. Never a password.
const mapSessionUser = (dto) => ({ id: dto.id, name: dto.name, email: dto.email, role: normalizeRole(dto.role) });

const mapSession = (dto) => ({ token: dto.token, user: mapSessionUser(dto.user) });

// Returns { token, user: { id, name, email, role } }. The password is never part of the result.
// MOCK ONLY: the mock compares plain-text demo passwords and issues an unsigned token. That is
// a development stand-in, not authentication; the backend verifies credentials and signs tokens.
// `remember` ("Remember me") makes the token last 30 days instead of 24 hours.
export const loginApi = async ({ email, password, remember = false }) => {
  const dto = await request({
    delay: 400,
    skipAuthHandling: true,
    access: ACCESS.PUBLIC,
    api: () => http.post('/auth/login', { email, password, remember: Boolean(remember) }, { skipAuthHandling: true }),
    mock: (db) => {
      // Like LoginRequest: both fields are checked first, and every wrong one is listed (422).
      const valid = checkFields({
        email: () => {
          const text = String(email ?? '').trim();
          if (!text) throw fieldError('email', 'Enter your email.');
          if (!EMAIL_PATTERN.test(text)) throw fieldError('email', 'Enter a valid email address.');
          if (text.length > MAX_TEXT_LENGTH) throw fieldError('email', `The email may not be longer than ${MAX_TEXT_LENGTH} characters.`);
          return text;
        },
        password: () => {
          // Never trimmed (Laravel leaves passwords as typed): only an empty one is missing.
          const text = String(password ?? '');
          if (!text) throw fieldError('password', 'Enter your password.');
          if (text.length > MAX_TEXT_LENGTH) throw fieldError('password', `The password may not be longer than ${MAX_TEXT_LENGTH} characters.`);
          return text;
        },
      });
      const wanted = valid.email.toLowerCase();
      const user = db.users.find((candidate) => candidate.email.toLowerCase() === wanted && candidate.password === password);
      if (!user) throw new ApiError('Invalid email or password.', { status: 401 });
      if (user.status !== USER_STATUS.ACTIVE) throw new ApiError('This account is inactive. Please contact an administrator.', { status: 403 });
      if (isAccountExpired(user, toISODate())) throw new ApiError(accountExpiredMessage(user), { status: 403 });
      user.lastActiveAt = new Date().toISOString();
      commit();
      return { token: createMockToken(user.id), user };
    },
  });

  const session = mapSession(dto);
  if (!session.user.role) throw new ApiError('Your account role is not supported by this application.', { status: 403 });
  return session;
};

// The user the token belongs to, as the server sees them right now. Called when the app starts
// with a stored session, so a changed role or name is picked up and a session that is no longer
// valid (expired token, deactivated account) ends with the usual 401 handling.
export const getCurrentUserApi = async () => {
  const dto = await request({
    delay: 50,
    api: () => http.get('/auth/me'),
    mock: () => requireCurrentUser(),
  });
  return mapSessionUser(dto);
};

// Tells the server the session is over so it can revoke the token. The UI signs out whether or
// not this succeeds. `token` is passed in because the stored session is already cleared.
export const logoutApi = async (token) => {
  await request({
    delay: 0,
    skipAuthHandling: true,
    access: ACCESS.PUBLIC,
    api: () => http.post('/auth/logout', null, { skipAuthHandling: true, headers: { Authorization: `Bearer ${token}` } }),
    mock: () => null,
  });
};
