import { ACCESS } from '../constants/users';
import { notifyUnauthorized, USE_MOCK_DATA } from './apiAxios';
import { ApiError } from './apiError';
import { authorize, getDb, mockDelay } from './mock/mockDb';

// Every service call goes through here. It picks the real API or the mock implementation,
// so switching VITE_USE_MOCK_DATA is the only change needed to go live.
//   api:  () => Promise<dto>      real HTTP call
//   mock: (db) => dto             same result computed from the in-memory mock database
//   access: who may call it (ACCESS in constants/users.js). Only the mock reads it: it rejects
//           the call with 401 / 403 the way the backend's own authentication and role checks will.
export const request = async ({ api, mock, delay = 150, skipAuthHandling = false, access = ACCESS.USER }) => {
  if (!USE_MOCK_DATA) return api();

  await mockDelay(delay);
  try {
    authorize(access);
    return mock(getDb());
  } catch (error) {
    if (!(error instanceof ApiError)) {
      // A bug in the mock layer itself: keep it visible to developers, show users a safe message.
      console.error('[mock]', error);
      throw new ApiError('Something went wrong. Please try again.');
    }
    if (error.status === 401 && !skipAuthHandling) notifyUnauthorized();
    throw error;
  }
};
