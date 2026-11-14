import { http } from './apiAxios';
import { fieldError } from './apiError';
import { commit, requireCurrentUser } from './mock/mockDb';
import { selectUser } from './mock/mockSelectors';
import { request } from './request';
import { mapUser, requireNewPassword, validateUserDetails } from './usersApi';

// Used by both the storekeeper Profile page and the admin Settings page. These always act on
// the signed-in user, who is identified from the token (never from an id sent by the page),
// in the mock exactly as the backend will do it.

export const getProfileApi = async () => {
  const dto = await request({
    api: () => http.get('/profile'),
    mock: (db) => selectUser(db, requireCurrentUser()),
  });
  return mapUser(dto);
};

// The users table holds phone numbers of up to 30 characters; the backend refuses longer ones (422).
const MAX_PHONE_LENGTH = 30;

const cleanPhone = (phone) => {
  const trimmed = String(phone ?? '').trim();
  if (trimmed.length > MAX_PHONE_LENGTH) throw fieldError('phone', `The phone number may not be longer than ${MAX_PHONE_LENGTH} characters.`);
  return trimmed;
};

// Payload: { name, email, phone }. 409 on "email" when another account already uses it.
export const updateProfileApi = async ({ name, email, phone }) => {
  const dto = await request({
    delay: 200,
    api: () => http.put('/profile', { name, email, phone }),
    mock: (db) => {
      const user = requireCurrentUser();
      Object.assign(user, validateUserDetails(db, { name, email }, user.id), { phone: cleanPhone(phone) });
      commit();
      return selectUser(db, user);
    },
  });
  return mapUser(dto);
};

// Payload: { currentPassword, newPassword }. Resolves with nothing on success.
export const changePasswordApi = async ({ currentPassword, newPassword }) => {
  await request({
    delay: 200,
    api: () => http.put('/profile/password', { currentPassword, newPassword }),
    mock: () => {
      const user = requireCurrentUser();
      if (user.password !== currentPassword) throw fieldError('currentPassword', 'Current password is incorrect.');
      user.password = requireNewPassword(newPassword, 'newPassword');
      commit();
    },
  });
};
