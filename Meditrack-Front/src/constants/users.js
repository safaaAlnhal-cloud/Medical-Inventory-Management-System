export const ROLES = { ADMIN: 'admin', STOREKEEPER: 'storekeeper' };

export const ROLE_LABELS = { admin: 'Admin', storekeeper: 'Storekeeper' };
export const ROLE_TITLES = { admin: 'Administrator', storekeeper: 'Storekeeper' };

export const USER_STATUS = { ACTIVE: 'active', INACTIVE: 'inactive' };
export const USER_STATUS_LABELS = { active: 'Active', inactive: 'Inactive' };

export const MIN_PASSWORD_LENGTH = 6;

// Who may call a service. The mock enforces it the way the backend's auth middleware will:
//   public: no session needed (login only)
//   user:   any signed-in, active user
//   admin:  a signed-in, active admin
export const ACCESS = { PUBLIC: 'public', USER: 'user', ADMIN: 'admin' };

const HOME_PATHS = { admin: '/admin/dashboard', storekeeper: '/storekeeper/dashboard' };

// Accepts any casing coming from storage or an API and returns a known role, or null.
export const normalizeRole = (value) => {
  const role = String(value ?? '').trim().toLowerCase();
  return Object.values(ROLES).includes(role) ? role : null;
};

export const getHomePath = (role) => HOME_PATHS[role] ?? '/login';
