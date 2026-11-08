import { daysAgo, minutesAgo } from './mockDates';

// Mock accounts. Passwords exist only in this mock store: services never return them.
export const mockUsers = [
  { id: 1, name: 'Sara Ahmed', email: 'sara@medcenter.ps', password: 'admin123', role: 'admin', status: 'active', phone: '', lastActiveAt: minutesAgo(35).toISOString() },
  { id: 2, name: 'Omar Saleh', email: 'omar@medcenter.ps', password: 'store123', role: 'storekeeper', status: 'active', phone: '', lastActiveAt: minutesAgo(95).toISOString() },
  { id: 3, name: 'Reem Haboush', email: 'reem@medcenter.ps', password: 'store123', role: 'storekeeper', status: 'active', phone: '', lastActiveAt: daysAgo(1, 16, 20).toISOString() },
  { id: 4, name: 'Mahmoud Ali', email: 'mahmoud@medcenter.ps', password: 'store123', role: 'storekeeper', status: 'inactive', phone: '', lastActiveAt: daysAgo(3, 11, 0).toISOString() },
  { id: 5, name: 'Safaa Alnhal', email: 'safaa@medcenter.ps', password: 'store123', role: 'storekeeper', status: 'active', phone: '', lastActiveAt: daysAgo(0, 9, 0).toISOString() },
];
