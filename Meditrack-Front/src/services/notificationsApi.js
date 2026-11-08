import { getExpiryStatus } from '../utils/stock';
import { http } from './apiAxios';
import { ApiError } from './apiError';
import { commit, matchesSearch, readNotifications, requireCurrentUser } from './mock/mockDb';
import { selectNameMaps } from './mock/mockSelectors';
import { request } from './request';

// Frontend notification model:
// { id, type ('low_stock' | 'expiring' | 'out_of_stock'), itemId, quantity, minQty,
//   batchId, expiryDate, expiryStatus, createdAt, read }
// batchId, expiryDate and expiryStatus ('expired' | 'expiring_soon') are set on 'expiring'
// notifications only. If an API leaves expiryStatus out, it is worked out here with the shared
// rule. The UI builds the title and description from these fields (utils/notifications.js).
export const mapNotification = (dto) => ({
  id: String(dto.id),
  type: dto.type,
  itemId: dto.itemId,
  quantity: Number(dto.quantity) || 0,
  minQty: dto.minQty == null ? null : Number(dto.minQty),
  batchId: dto.batchId ?? null,
  expiryDate: dto.expiryDate ?? null,
  expiryStatus: dto.expiryStatus === undefined ? getExpiryStatus(dto.expiryDate) : dto.expiryStatus,
  createdAt: dto.createdAt,
  read: Boolean(dto.read),
});

// Mock-side: read state is stored per user, so one user reading an alert leaves it unread for others.
const markReadBy = (db, id, userId) => {
  const { readBy } = db.notificationState[id];
  if (!readBy.includes(userId)) readBy.push(userId);
};

// Mock-side search, shared with the dashboard alerts.
export const searchMockNotifications = (db, notifications, search) => {
  const { itemNames, batchNumbers } = selectNameMaps(db);
  return notifications.filter((notification) =>
    matchesSearch([itemNames.get(notification.itemId), notification.type.replace(/_/g, ' '), batchNumbers.get(notification.batchId)], search));
};

export const getNotificationsApi = async ({ search = '' } = {}) => {
  const dtos = await request({
    api: () => http.get('/notifications', { params: { search: search || undefined } }),
    mock: (db) => searchMockNotifications(db, readNotifications(), search),
  });
  return dtos.map(mapNotification);
};

export const getUnreadNotificationsCountApi = async () => {
  const dto = await request({
    delay: 50,
    api: () => http.get('/notifications/unread-count'),
    mock: () => ({ count: readNotifications().filter((notification) => !notification.read).length }),
  });
  return Number(dto.count) || 0;
};

export const markNotificationReadApi = async (id) => {
  const dto = await request({
    delay: 100,
    api: () => http.patch(`/notifications/${id}/read`),
    mock: (db) => {
      const notification = readNotifications().find((candidate) => candidate.id === id);
      if (!notification) throw new ApiError('This notification no longer exists.', { status: 404 });
      markReadBy(db, id, requireCurrentUser().id);
      commit();
      return { ...notification, read: true };
    },
  });
  return mapNotification(dto);
};

// Resolves with nothing on success.
export const markAllNotificationsReadApi = async () => {
  await request({
    delay: 100,
    api: () => http.patch('/notifications/read-all'),
    mock: (db) => {
      const userId = requireCurrentUser().id;
      readNotifications().forEach((notification) => markReadBy(db, notification.id, userId));
      commit();
    },
  });
};
