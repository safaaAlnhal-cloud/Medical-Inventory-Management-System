import axios from 'axios';
import { toApiError } from './apiError';
import { getStoredToken } from './authStorage';

// Mock mode is an explicit choice:
//   VITE_USE_MOCK_DATA=true   mock data (also in a production build, e.g. for a demo)
//   VITE_USE_MOCK_DATA=false  real API
//   not set                   mock data under `npm run dev`, real API in a production build,
//                             so a deployed build can never fall back to fake data by accident.
const mockSetting = import.meta.env.VITE_USE_MOCK_DATA;
export const USE_MOCK_DATA = mockSetting === 'true' || (mockSetting !== 'false' && Boolean(import.meta.env.DEV));

const REQUEST_TIMEOUT_MS = 20000;

const apiAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: REQUEST_TIMEOUT_MS,
});

apiAxios.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Central 401 handling. AuthContext registers its logout here; only an authentication
// failure triggers it, never other errors.
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (handler) => { unauthorizedHandler = handler; };
export const notifyUnauthorized = () => { if (unauthorizedHandler) unauthorizedHandler(); };

apiAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error);
    // The login request opts out: wrong credentials are not an expired session.
    if (apiError.status === 401 && !error.config?.skipAuthHandling) notifyUnauthorized();
    return Promise.reject(apiError);
  },
);

// The backend is expected to return the resource itself as the JSON body (no envelope).
// If it wraps responses (e.g. { data: ... }), change `unwrap` here only.
const unwrap = (response) => response.data;

export const http = {
  get: (url, config) => apiAxios.get(url, config).then(unwrap),
  post: (url, body, config) => apiAxios.post(url, body, config).then(unwrap),
  put: (url, body, config) => apiAxios.put(url, body, config).then(unwrap),
  patch: (url, body, config) => apiAxios.patch(url, body, config).then(unwrap),
  delete: (url, config) => apiAxios.delete(url, config).then(unwrap),
};

export default apiAxios;
