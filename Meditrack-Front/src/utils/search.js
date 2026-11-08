// Navbar search settings per page. The query itself lives in the URL as ?q= and each list page
// passes it to its service. Pages with nothing to search have the input disabled.
const SEARCH_CONFIGS = [
  { segment: 'dashboard', placeholder: 'Search dashboard...', enabled: true },
  { segment: 'inventory', placeholder: 'Search inventory...', enabled: true },
  { segment: 'transactions', placeholder: 'Search transactions...', enabled: true },
  { segment: 'users', placeholder: 'Search users...', enabled: true },
  { segment: 'reports', placeholder: 'Search reports...', enabled: true },
  { segment: 'notifications', placeholder: 'Search notifications...', enabled: true },
  { segment: 'settings', placeholder: 'Search settings...', enabled: false },
  { segment: 'profile', placeholder: 'Search profile...', enabled: false },
];

export const getSearchConfig = (pathname = '') =>
  SEARCH_CONFIGS.find((config) => pathname.includes(`/${config.segment}`)) || SEARCH_CONFIGS[0];
