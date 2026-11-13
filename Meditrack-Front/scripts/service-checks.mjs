// Service-level checks for the business rules of the mock data layer.
//
//   npm run check:services
//
// The project has no test framework, so this uses only what is already installed: Node's own
// assert module, and Vite (a dev dependency) to load the service modules exactly as the app
// does. Browser storage is replaced by an in-memory stand-in; nothing is written to disk and no
// network request is made. Every check starts from the seed data in src/mockData.
//
// These checks call the same service functions the pages call. They do not open a browser, so
// they say nothing about layout or about what a click does on screen.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
};
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();

// The mock reports its own bugs with console.error; a rejected request is not one of them.
const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
const load = (file) => server.ssrLoadModule(`/src/${file}`);

const checks = [];
const check = (name, run) => checks.push({ name, run });
const round2 = (value) => Math.round(value * 100) / 100;

// Resolves with the ApiError a call is rejected with; fails the check if the call succeeds.
const rejection = async (promise, status, field) => {
  let error = null;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, 'expected the request to be rejected, but it succeeded');
  assert.equal(error.name, 'ApiError', `expected an ApiError, got: ${error.message}`);
  if (status) assert.equal(error.status, status, `expected status ${status}, got ${error.status}: ${error.message}`);
  if (field) assert.ok(error.fieldErrors?.[field], `expected a message for the "${field}" field, got: ${JSON.stringify(error.fieldErrors)}`);
  return error;
};

let failures = 0;
try {
  const auth = await load('services/authApi.js');
  const inventory = await load('services/inventoryApi.js');
  const transactions = await load('services/transactionsApi.js');
  const reports = await load('services/reportsApi.js');
  const dashboard = await load('services/dashboardApi.js');
  const notifications = await load('services/notificationsApi.js');
  const users = await load('services/usersApi.js');
  const categories = await load('services/categoriesApi.js');
  const profile = await load('services/profileApi.js');
  const manufacturers = await load('services/manufacturersApi.js');
  const { resolveDateRange } = await load('utils/reports.js');
  const { toISODate } = await load('utils/dates.js');

  const ADMIN = { email: 'sara@medcenter.ps', password: 'admin123' };
  const STOREKEEPER = { email: 'omar@medcenter.ps', password: 'store123' };
  const today = toISODate();
  const sixMonths = { ...resolveDateRange('6m'), page: 1, pageSize: 1000 };

  const signOut = () => sessionStorage.removeItem('meditrack.session');
  const signIn = async (credentials) => {
    signOut();
    const session = await auth.loginApi(credentials);
    sessionStorage.setItem('meditrack.session', JSON.stringify(session));
    return session.user;
  };
  // A fresh copy of the seed data for every check.
  const { resetMockDb } = await load('services/mock/mockDb.js');
  const reset = () => {
    signOut();
    resetMockDb();
  };

  const incoming = (overrides = {}) => ({ itemId: 2, batchNumber: 'CHK-1', quantity: 10, unitCost: 5, date: today, expiryDate: null, supplier: 'Check Supplier', ...overrides });
  const valueOfRows = (report, type) => round2(report.rows.filter((row) => row.type === type).reduce((sum, row) => sum + (row.totalValue ?? 0), 0));
  const findItem = async (id) => (await inventory.getInventoryItemsApi()).find((item) => item.id === id);

  // ---- Authentication and roles -----------------------------------------------------------------

  check('no session: every data request is rejected with 401', async () => {
    signOut();
    await rejection(users.getUsersApi(), 401);
    await rejection(inventory.getInventoryItemsApi(), 401);
    await rejection(transactions.createIncomingTransactionApi(incoming()), 401);
  });

  check('login: wrong password is 401, inactive account is 403', async () => {
    await rejection(auth.loginApi({ email: ADMIN.email, password: 'wrong' }), 401);
    await rejection(auth.loginApi({ email: 'mahmoud@medcenter.ps', password: 'store123' }), 403);
  });

  check('account expiry: works on its last day, then login is 403 and an open session is 401', async () => {
    const { getDb } = await load('services/mock/mockDb.js');
    const omar = getDb().users.find((user) => user.email === STOREKEEPER.email);
    omar.accountExpiresOn = today;
    await signIn(STOREKEEPER);
    await users.getUserDirectoryApi();

    omar.accountExpiresOn = '2000-01-01';
    const sessionError = await rejection(users.getUserDirectoryApi(), 401);
    assert.equal(sessionError.message, 'This account expired on 2000-01-01. Please contact an administrator.');
    await rejection(auth.loginApi(STOREKEEPER), 403);
  });

  check('storekeeper: admin-only services are rejected with 403', async () => {
    await signIn(STOREKEEPER);
    await rejection(users.getUsersApi(), 403);
    await rejection(users.createUserApi({ name: 'X', email: 'x@y.zz', password: 'secret1' }), 403);
    await rejection(categories.createCategoryApi({ name: 'Nope' }), 403);
    await rejection(reports.getReportApi('summary', sixMonths), 403);
    await rejection(dashboard.getStockMovementApi(), 403);
  });

  check('manufacturers: the whole list alphabetically, a search by part of the name, and too long a search is 422', async () => {
    await signIn(STOREKEEPER);
    assert.deepEqual((await manufacturers.getManufacturersApi()).map((manufacturer) => manufacturer.name),
      ['CottonLine', 'Medica Labs', 'Nova Pharma', 'PureFluids Co.', 'SafeCare Industries']);
    assert.deepEqual(await manufacturers.getManufacturersApi({ search: '  CARE ' }), [{ id: 3, name: 'SafeCare Industries' }]);
    assert.deepEqual(await manufacturers.getManufacturersApi({ search: 'xyz' }), []);
    await rejection(manufacturers.getManufacturersApi({ search: 'a'.repeat(151) }), 422, 'search');
    signOut();
    await rejection(manufacturers.getManufacturersApi(), 401);
  });

  check('storekeeper: shared services work and the profile is always their own', async () => {
    const user = await signIn(STOREKEEPER);
    assert.ok((await inventory.getInventoryItemsApi()).length > 0);
    assert.ok((await transactions.getIncomingTransactionsApi()).length > 0);
    assert.equal((await profile.getProfileApi()).id, user.id);
  });

  check('a transaction is recorded under the signed-in user, never a user id from the page', async () => {
    const user = await signIn(STOREKEEPER);
    const saved = await transactions.createIncomingTransactionApi(incoming({ recordedBy: 1 }));
    assert.equal(saved.recordedBy, user.id);
  });

  check('a deactivated account loses its session (401)', async () => {
    const storekeeper = await signIn(STOREKEEPER);
    const storekeeperSession = sessionStorage.getItem('meditrack.session');
    await signIn(ADMIN);
    await users.updateUserApi(storekeeper.id, { name: storekeeper.name, email: storekeeper.email, status: 'inactive' });
    sessionStorage.setItem('meditrack.session', storekeeperSession);
    await rejection(inventory.getInventoryItemsApi(), 401);
    await rejection(auth.getCurrentUserApi(), 401);
  });

  check('users: validation, no self-deactivation, admin password reset', async () => {
    const admin = await signIn(ADMIN);
    await rejection(users.createUserApi({ name: '   ', email: 'new@medcenter.ps', password: 'secret1' }), 422, 'name');
    await rejection(users.createUserApi({ name: 'New User', email: 'not-an-email', password: 'secret1' }), 422, 'email');
    await rejection(users.createUserApi({ name: 'New User', email: 'new@medcenter.ps', password: '123' }), 422, 'password');
    await rejection(users.createUserApi({ name: 'New User', email: STOREKEEPER.email, password: 'secret1' }), 409, 'email');
    await rejection(users.updateUserApi(3, { name: 'Reem', email: 'reem@medcenter.ps', status: 'banana' }), 422, 'status');
    await rejection(users.updateUserApi(admin.id, { name: admin.name, email: admin.email, status: 'inactive' }), 409, 'status');
    await rejection(users.resetUserPasswordApi(2, { newPassword: '123' }), 422, 'newPassword');
    await users.resetUserPasswordApi(2, { newPassword: 'brand-new-pass' });
    await rejection(auth.loginApi(STOREKEEPER), 401);
    assert.equal((await auth.loginApi({ email: STOREKEEPER.email, password: 'brand-new-pass' })).user.id, 2);
  });

  check('profile: password change needs the current password and a valid new one', async () => {
    await signIn(STOREKEEPER);
    await rejection(profile.changePasswordApi({ currentPassword: 'wrong', newPassword: 'another-pass' }), 422, 'currentPassword');
    await rejection(profile.changePasswordApi({ currentPassword: STOREKEEPER.password, newPassword: 'x' }), 422, 'newPassword');
    await profile.changePasswordApi({ currentPassword: STOREKEEPER.password, newPassword: 'another-pass' });
    assert.equal((await auth.loginApi({ email: STOREKEEPER.email, password: 'another-pass' })).user.id, 2);
  });

  // ---- Archiving --------------------------------------------------------------------------------

  check('archive: refused while the item has stock, and nothing changes', async () => {
    await signIn(ADMIN);
    const before = await reports.getReportApi('inventory_value', sixMonths);
    const error = await rejection(inventory.archiveInventoryItemApi(1), 409);
    assert.match(error.message, /still has 500 in stock/);
    const after = await reports.getReportApi('inventory_value', sixMonths);
    assert.equal(after.totals.stockValue, before.totals.stockValue);
    assert.ok(await findItem(1), 'the item is still in the active inventory');
  });

  check('archive: the item leaves the active lists, its history and every value stay', async () => {
    await signIn(ADMIN);
    const SYRINGES = 5; // seed item with no stock left and four past transactions
    const movementBefore = await reports.getReportApi('movement_history', sixMonths);
    const valueBefore = await reports.getReportApi('inventory_value', sixMonths);
    const incomingBefore = await transactions.getIncomingTransactionsApi({ itemId: SYRINGES });
    const outgoingBefore = await transactions.getOutgoingTransactionsApi({ itemId: SYRINGES });
    assert.ok(incomingBefore.length + outgoingBefore.length >= 4);

    const archived = await inventory.archiveInventoryItemApi(SYRINGES);
    assert.equal(archived.archived, true);
    assert.ok(archived.archivedAt);
    assert.equal(archived.id, SYRINGES);

    assert.equal(await findItem(SYRINGES), undefined, 'gone from the active inventory');
    assert.deepEqual((await inventory.getArchivedInventoryItemsApi()).map((item) => item.id), [SYRINGES]);
    assert.equal((await inventory.getInventoryLookupApi()).find((item) => item.id === SYRINGES).archived, true);
    assert.equal((await inventory.getInventoryItemsApi({ search: 'Syringes' })).length, 0, 'not found by the active search');
    assert.equal((await inventory.getArchivedInventoryItemsApi({ search: 'Syringes' })).length, 1, 'found by the archived search');
    assert.ok(!(await notifications.getNotificationsApi()).some((alert) => alert.itemId === SYRINGES), 'no alerts for an archived item');

    // History is untouched.
    assert.deepEqual(await transactions.getIncomingTransactionsApi({ itemId: SYRINGES }), incomingBefore);
    assert.deepEqual(await transactions.getOutgoingTransactionsApi({ itemId: SYRINGES }), outgoingBefore);
    const movementAfter = await reports.getReportApi('movement_history', sixMonths);
    assert.deepEqual(movementAfter.rows, movementBefore.rows);

    // Values: stock value unchanged, and the two reports still agree with each other.
    const valueAfter = await reports.getReportApi('inventory_value', sixMonths);
    assert.equal(valueAfter.totals.stockValue, valueBefore.totals.stockValue);
    assert.equal(valueAfter.totals.incomingValue, valueBefore.totals.incomingValue);
    assert.equal(valueAfter.totals.outgoingValue, valueBefore.totals.outgoingValue);
    assert.equal(valueAfter.totals.incomingValue, valueOfRows(movementAfter, 'incoming'));
    assert.equal(valueAfter.totals.outgoingValue, valueOfRows(movementAfter, 'outgoing'));
    assert.ok(!valueAfter.rows.some((row) => row.itemId === SYRINGES), 'not listed as current inventory');
    assert.equal((await dashboard.getDashboardSummaryApi()).totalItems, 5);
  });

  check('archived item: no new transactions, and its history cannot be edited or cancelled', async () => {
    await signIn(ADMIN);
    const SYRINGES = 5;
    const [firstIssue] = await transactions.getOutgoingTransactionsApi({ itemId: SYRINGES });
    await inventory.archiveInventoryItemApi(SYRINGES);
    await rejection(transactions.createIncomingTransactionApi(incoming({ itemId: SYRINGES })), 422, 'itemId');
    await rejection(transactions.createOutgoingTransactionApi({ itemId: SYRINGES, batchId: 1, quantity: 1, date: today, recipient: 'Ward' }), 422, 'itemId');
    await rejection(transactions.cancelTransactionApi(firstIssue.id), 409);
    await rejection(transactions.updateTransactionApi(firstIssue.id, { type: 'outgoing', itemId: SYRINGES, quantity: 1, date: firstIssue.date, batchId: firstIssue.batchId, recipient: 'Ward' }), 409);
    await rejection(inventory.updateInventoryItemApi(SYRINGES, { name: 'Renamed', categoryId: 2, unit: 'box', minQty: 1 }), 409);
    await rejection(inventory.archiveInventoryItemApi(SYRINGES), 409);
  });

  check('restore: the item returns with its history; a name clash is refused', async () => {
    await signIn(ADMIN);
    const SYRINGES = 5;
    const historyBefore = await transactions.getOutgoingTransactionsApi({ itemId: SYRINGES });
    await inventory.archiveInventoryItemApi(SYRINGES);

    const twin = await inventory.createInventoryItemApi({ name: 'Syringes 5ml', categoryId: 2, unit: 'box', minQty: 1 });
    await rejection(inventory.restoreInventoryItemApi(SYRINGES), 409);
    await inventory.updateInventoryItemApi(twin.id, { name: 'Syringes 5ml (new)', categoryId: 2, unit: 'box', minQty: 1 });

    const restored = await inventory.restoreInventoryItemApi(SYRINGES);
    assert.equal(restored.archived, false);
    assert.equal(restored.archivedAt, null);
    assert.ok(await findItem(SYRINGES));
    assert.deepEqual(await inventory.getArchivedInventoryItemsApi(), []);
    assert.deepEqual(await transactions.getOutgoingTransactionsApi({ itemId: SYRINGES }), historyBefore);
    await rejection(inventory.restoreInventoryItemApi(SYRINGES), 409);
    // Active again: transactions can be recorded once more.
    assert.equal((await transactions.createIncomingTransactionApi(incoming({ itemId: SYRINGES }))).itemId, SYRINGES);
  });

  check('categories: cannot be deleted while active or archived items use them', async () => {
    await signIn(ADMIN);
    const category = await categories.createCategoryApi({ name: 'Temporary' });
    const item = await inventory.createInventoryItemApi({ name: 'Temp Item', categoryId: category.id, unit: 'box', minQty: 0 });
    await rejection(categories.deleteCategoryApi(category.id), 409);
    await inventory.archiveInventoryItemApi(item.id);
    const error = await rejection(categories.deleteCategoryApi(category.id), 409);
    assert.match(error.message, /deactivated items/);
    await rejection(categories.deleteCategoryApi(9999), 404);
    await rejection(categories.createCategoryApi({ name: 'temporary' }), 409, 'name');
  });

  // ---- Items ------------------------------------------------------------------------------------

  check('items: validation, unique active names, and an update never touches stock', async () => {
    await signIn(STOREKEEPER);
    await rejection(inventory.createInventoryItemApi({ name: '  ', categoryId: 1, unit: 'box', minQty: 1 }), 422, 'name');
    await rejection(inventory.createInventoryItemApi({ name: 'Item', categoryId: 999, unit: 'box', minQty: 1 }), 422, 'categoryId');
    await rejection(inventory.createInventoryItemApi({ name: 'Item', categoryId: 1, unit: 'crate', minQty: 1 }), 422, 'unit');
    await rejection(inventory.createInventoryItemApi({ name: 'Item', categoryId: 1, unit: 'box', minQty: -1 }), 422, 'minQty');
    await rejection(inventory.createInventoryItemApi({ name: 'paracetamol 500MG', categoryId: 1, unit: 'box', minQty: 1 }), 409, 'name');

    const before = await findItem(1);
    const updated = await inventory.updateInventoryItemApi(1, { name: 'Paracetamol 500mg Tabs', categoryId: 1, unit: 'box', minQty: 25 });
    assert.equal(updated.quantity, before.quantity);
    assert.equal(updated.avgUnitCost, before.avgUnitCost);
    assert.deepEqual(updated.batches, before.batches);
    assert.equal(updated.id, before.id);
  });

  check('a new item with no stock raises no alert; an item that ran out does', async () => {
    await signIn(STOREKEEPER);
    const alertsBefore = await notifications.getNotificationsApi();
    const item = await inventory.createInventoryItemApi({ name: 'Brand New Item', categoryId: 1, unit: 'box', minQty: 5 });
    assert.equal(item.status, 'out_of_stock', 'its stock status is still out of stock');
    assert.equal((await notifications.getNotificationsApi()).length, alertsBefore.length);
    assert.ok(!(await dashboard.getCriticalInventoryApi()).some((row) => row.itemId === item.id));
    // Seed item 5 received stock and used it all: that is a real out-of-stock alert.
    assert.ok(alertsBefore.some((alert) => alert.type === 'out_of_stock' && alert.itemId === 5));
  });

  // ---- Transactions -----------------------------------------------------------------------------

  check('incoming: every invalid field is rejected and nothing is stored', async () => {
    await signIn(STOREKEEPER);
    const batchesBefore = (await inventory.getBatchLookupApi()).length;
    const stockBefore = (await findItem(2)).quantity;
    await rejection(transactions.createIncomingTransactionApi(incoming({ itemId: 999 })), 422, 'itemId');
    for (const quantity of [0, -5, null, '', Number.NaN]) await rejection(transactions.createIncomingTransactionApi(incoming({ quantity })), 422, 'quantity');
    for (const unitCost of [-1, null, '', Number.NaN]) await rejection(transactions.createIncomingTransactionApi(incoming({ unitCost })), 422, 'unitCost');
    await rejection(transactions.createIncomingTransactionApi(incoming({ date: '' })), 422, 'date');
    await rejection(transactions.createIncomingTransactionApi(incoming({ date: '2026-02-31' })), 422, 'date');
    await rejection(transactions.createIncomingTransactionApi(incoming({ expiryDate: 'soon' })), 422, 'expiryDate');
    await rejection(transactions.createIncomingTransactionApi(incoming({ batchNumber: '  ' })), 422, 'batchNumber');
    await rejection(transactions.createIncomingTransactionApi(incoming({ supplier: 'a'.repeat(151) })), 422, 'supplier');
    await rejection(transactions.createIncomingTransactionApi(incoming({ manufacturer: 'a'.repeat(151) })), 422, 'manufacturer');
    await rejection(transactions.createIncomingTransactionApi(incoming({ manufacturer: '...' })), 422, 'manufacturer');
    for (const manufacturingDate of ['soon', '2099-01-01']) await rejection(transactions.createIncomingTransactionApi(incoming({ manufacturingDate })), 422, 'manufacturingDate');
    await rejection(transactions.createIncomingTransactionApi(incoming({ date: '2026-01-10', manufacturingDate: '2026-01-11' })), 422, 'manufacturingDate');
    await rejection(transactions.createIncomingTransactionApi(incoming({ date: '2026-01-10', expiryDate: '2026-01-10', manufacturingDate: '2026-01-11' })), 422, 'manufacturingDate');
    // AM-201 (Amoxicillin) is Medica Labs': the same number from Medica Labs, in any spelling, clashes.
    await rejection(transactions.createIncomingTransactionApi(incoming({ batchNumber: 'am-201', manufacturer: 'MEDICA labs' })), 409, 'batchNumber');
    assert.equal((await inventory.getBatchLookupApi()).length, batchesBefore, 'no batch was created by a rejected request');
    assert.equal((await findItem(2)).quantity, stockBefore);
  });

  check('incoming: supplier and manufacturer are optional; a manufacturer is found by any spelling or created once', async () => {
    await signIn(STOREKEEPER);
    const count = async () => (await manufacturers.getManufacturersApi()).length;
    const before = await count();

    const bare = await transactions.createIncomingTransactionApi(incoming({ supplier: null, manufacturer: null, manufacturingDate: null }));
    assert.equal(bare.supplier, null);
    assert.equal(bare.manufacturerId, null);

    const existing = await transactions.createIncomingTransactionApi(incoming({ batchNumber: 'CHK-2', manufacturer: 'nova  PHARMA', manufacturingDate: '2026-01-01' }));
    assert.equal(existing.manufacturerId, 1, 'Nova Pharma was found, not created again');
    assert.equal(existing.manufacturingDate, '2026-01-01');
    assert.equal(await count(), before);

    const created = await transactions.createIncomingTransactionApi(incoming({ batchNumber: 'CHK-3', manufacturer: 'Brand New Labs' }));
    assert.equal(await count(), before + 1);
    assert.ok((await manufacturers.getManufacturersApi({ search: 'brand new' })).some((m) => m.id === created.manufacturerId));

    // The same number is fine from another manufacturer or with none, but not twice from the same one.
    await transactions.createIncomingTransactionApi(incoming({ batchNumber: 'AM-201', manufacturer: 'Nova Pharma' }));
    await rejection(transactions.createIncomingTransactionApi(incoming({ batchNumber: 'CHK-1' })), 409, 'batchNumber');
    // A rejected receipt leaves no new manufacturer behind.
    await rejection(transactions.createIncomingTransactionApi(incoming({ batchNumber: 'CHK-4', quantity: 0, manufacturer: 'Never Saved Ltd' })), 422, 'quantity');
    assert.equal(await count(), before + 1);
    // Search matches the manufacturer name.
    assert.ok((await transactions.getIncomingTransactionsApi({ search: 'brand new' })).some((tx) => tx.id === created.id));
  });

  check('incoming: a unit cost of 0 is allowed, and create and edit apply the same rule', async () => {
    await signIn(STOREKEEPER);
    const saved = await transactions.createIncomingTransactionApi(incoming({ unitCost: 0 }));
    assert.equal(saved.unitCost, 0);
    const edit = { type: 'incoming', itemId: 2, quantity: 10, date: today, batchNumber: 'CHK-1', expiryDate: null, supplier: 'Check Supplier' };
    await rejection(transactions.updateTransactionApi(saved.id, { ...edit, unitCost: -1 }), 422, 'unitCost');
    await rejection(transactions.updateTransactionApi(saved.id, { ...edit, unitCost: 4, supplier: 'a'.repeat(151) }), 422, 'supplier');
    await rejection(transactions.updateTransactionApi(saved.id, { ...edit, unitCost: 4, manufacturingDate: '2099-01-01' }), 422, 'manufacturingDate');
    const updated = await transactions.updateTransactionApi(saved.id, { ...edit, unitCost: 4, supplier: null, manufacturer: 'Medica Labs' });
    assert.equal(updated.unitCost, 4);
    assert.equal(updated.supplier, null);
    assert.equal(updated.manufacturerId, 2);
  });

  check('outgoing batch list: nearest expiry first, the chosen manufacturer first, expired last', async () => {
    await signIn(STOREKEEPER);
    const numbers = async (manufacturerId) => (await transactions.getItemBatchOptionsApi(1, { manufacturerId })).map((batch) => batch.batchNumber);
    // Paracetamol: PC-101 (Nova Pharma) expires before PC-102 (Medica Labs).
    assert.deepEqual(await numbers(), ['PC-101', 'PC-102']);
    assert.deepEqual(await numbers(2), ['PC-102', 'PC-101'], 'Medica Labs first');
    const options = await transactions.getItemBatchOptionsApi(1);
    assert.deepEqual(options.map((batch) => batch.manufacturerId), [1, 2]);

    // A back-dated receipt of a batch that has expired since: listed last, with nothing to issue.
    await transactions.createIncomingTransactionApi(incoming({ itemId: 1, batchNumber: 'OLD-1', date: '2026-01-01', expiryDate: '2026-02-01', manufacturer: 'Medica Labs' }));
    const withExpired = await transactions.getItemBatchOptionsApi(1, { manufacturerId: 2 });
    assert.deepEqual(withExpired.map((batch) => batch.batchNumber), ['PC-102', 'PC-101', 'OLD-1']);
    assert.equal(withExpired[2].quantity, 0);
    assert.equal(withExpired[2].expiryStatus, 'expired');

    await rejection(transactions.getItemBatchOptionsApi(999), 404);
  });

  check('outgoing: cannot exceed the stock of the batch, and a rejected issue changes nothing', async () => {
    await signIn(STOREKEEPER);
    const item = await findItem(2); // Amoxicillin: 15 left in one batch
    const [batch] = item.batches;
    const issue = (overrides = {}) => ({ itemId: 2, batchId: batch.id, quantity: 5, date: today, recipient: 'Ward', ...overrides });
    await rejection(transactions.createOutgoingTransactionApi(issue({ quantity: batch.quantity + 1 })), 422, 'quantity');
    await rejection(transactions.createOutgoingTransactionApi(issue({ quantity: 0 })), 422, 'quantity');
    await rejection(transactions.createOutgoingTransactionApi(issue({ batchId: 5 })), 422, 'batchId');
    await rejection(transactions.createOutgoingTransactionApi(issue({ recipient: '' })), 422, 'recipient');
    await rejection(transactions.createOutgoingTransactionApi(issue({ date: '2000-01-01' })), 422, 'date');
    assert.equal((await findItem(2)).quantity, item.quantity);

    const saved = await transactions.createOutgoingTransactionApi(issue());
    assert.equal(saved.unitCost, item.avgUnitCost, 'the unit cost is the Average Cost at that moment');
    assert.equal((await findItem(2)).quantity, item.quantity - 5);
  });

  check('cancel: stock returns, the record stays, and it cannot be cancelled twice', async () => {
    await signIn(STOREKEEPER);
    const before = await findItem(2);
    const [batch] = before.batches;
    const saved = await transactions.createOutgoingTransactionApi({ itemId: 2, batchId: batch.id, quantity: 5, date: today, recipient: 'Ward' });
    const cancelled = await transactions.cancelTransactionApi(saved.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal((await findItem(2)).quantity, before.quantity);
    assert.ok((await transactions.getOutgoingTransactionsApi()).some((row) => row.id === saved.id && row.status === 'cancelled'));
    await rejection(transactions.cancelTransactionApi(saved.id), 409);
    // An incoming transaction whose batch has been issued from cannot be cancelled.
    await rejection(transactions.cancelTransactionApi(17), 409);
  });

  // ---- Values and reports -----------------------------------------------------------------------

  check('movement history: incoming and outgoing rows both carry quantity x unit cost', async () => {
    await signIn(ADMIN);
    const report = await reports.getReportApi('movement_history', sixMonths);
    assert.equal(report.rows.length, 21);
    for (const row of report.rows) {
      assert.notEqual(row.totalValue, null, `${row.type} row ${row.id} has no value`);
      assert.equal(row.totalValue, round2(row.quantity * row.unitCost));
    }
    assert.ok(report.rows.some((row) => row.type === 'outgoing' && row.totalValue > 0));
  });

  check('inventory value: totals equal the movement rows for every period and filter', async () => {
    await signIn(ADMIN);
    for (const period of ['30d', '3m', '6m']) {
      for (const filter of [{}, { itemId: 1 }, { categoryId: 2 }]) {
        const query = { ...resolveDateRange(period), ...filter, page: 1, pageSize: 1000 };
        const movement = await reports.getReportApi('movement_history', query);
        const value = await reports.getReportApi('inventory_value', query);
        assert.equal(value.totals.incomingValue, valueOfRows(movement, 'incoming'), `${period} ${JSON.stringify(filter)} incoming`);
        assert.equal(value.totals.outgoingValue, valueOfRows(movement, 'outgoing'), `${period} ${JSON.stringify(filter)} outgoing`);
      }
    }
    const all = await reports.getReportApi('inventory_value', sixMonths);
    assert.equal(all.totals.incomingValue, 14590.25);
    assert.equal(all.totals.outgoingValue, 5669);
    assert.equal(all.totals.stockValue, round2(all.rows.reduce((sum, row) => sum + row.totalValue, 0)));
  });

  check('rounding: stock value does not drift from what was paid', async () => {
    await signIn(STOREKEEPER);
    const item = await inventory.createInventoryItemApi({ name: 'Rounding Item', categoryId: 1, unit: 'box', minQty: 0 });
    await transactions.createIncomingTransactionApi(incoming({ itemId: item.id, batchNumber: 'R-1', quantity: 3, unitCost: 10 }));
    await transactions.createIncomingTransactionApi(incoming({ itemId: item.id, batchNumber: 'R-2', quantity: 4, unitCost: 11 }));
    await signIn(ADMIN);
    const report = await reports.getReportApi('inventory_value', { ...sixMonths, itemId: item.id });
    assert.equal(report.rows[0].totalValue, 74);
    assert.equal(report.totals.incomingValue, 74);
  });

  check('reports: date ranges are calendar months; inventory reports ignore the period', async () => {
    assert.deepEqual(resolveDateRange('3m', new Date(2026, 4, 31)), { from: '2026-02-28', to: '2026-05-31' });
    assert.deepEqual(resolveDateRange('6m', new Date(2026, 9, 10)), { from: '2026-04-10', to: '2026-10-10' });
    assert.deepEqual(resolveDateRange('30d', new Date(2026, 9, 10)), { from: '2026-09-10', to: '2026-10-10' });
    await signIn(ADMIN);
    const short = await reports.getReportApi('summary', { ...resolveDateRange('30d'), page: 1, pageSize: 1000 });
    const long = await reports.getReportApi('summary', sixMonths);
    assert.deepEqual(short.totals, long.totals);
    const paged = await reports.getReportApi('movement_history', { ...sixMonths, pageSize: 5, page: 2 });
    assert.deepEqual([paged.rows.length, paged.pagination.totalItems, paged.pagination.totalPages], [5, 21, 5]);
  });

  check('dashboard: status counts add up, and expired is never counted as expiring soon', async () => {
    await signIn(STOREKEEPER);
    const summary = await dashboard.getDashboardSummaryApi();
    assert.deepEqual(summary, { totalItems: 6, availableCount: 3, lowStockCount: 2, outOfStockCount: 1, expiringSoonCount: 2, expiredCount: 0 });
    assert.equal(summary.availableCount + summary.lowStockCount + summary.outOfStockCount, summary.totalItems);

    const item = await inventory.createInventoryItemApi({ name: 'Expired Item', categoryId: 1, unit: 'box', minQty: 0 });
    await transactions.createIncomingTransactionApi(incoming({ itemId: item.id, batchNumber: 'OLD-1', date: '2024-01-01', expiryDate: '2024-06-01' }));
    const after = await dashboard.getDashboardSummaryApi();
    assert.equal(after.expiredCount, 1);
    assert.equal(after.expiringSoonCount, 2, 'the expired batch is not counted as expiring soon');
    // Its only stock has expired, so nothing is available: out of stock, plus the expired batch.
    const alerts = (await notifications.getNotificationsApi()).filter((entry) => entry.itemId === item.id);
    assert.deepEqual(alerts.map((entry) => entry.type).sort(), ['expiring', 'out_of_stock']);
    assert.equal(alerts.find((entry) => entry.type === 'expiring').expiryStatus, 'expired');
    assert.equal(after.outOfStockCount, 2);
    assert.equal((await findItem(item.id)).batches[0].expiryStatus, 'expired');
  });

  // ---- Batch expiry and disposal ----------------------------------------------------------------

  // "Medicine A": batch B001 (10, bought at $5) has expired, batch B002 (20, bought at $7) is valid.
  // Average Cost = (10×5 + 20×7) ÷ 30 = 6.3333. Total value 190; expired 10 × 6.3333 = 63.33.
  const EXPIRED_ON = '2025-06-30';
  const setUpMedicineA = async () => {
    await signIn(STOREKEEPER);
    const item = await inventory.createInventoryItemApi({ name: 'Medicine A', categoryId: 1, unit: 'box', minQty: 5 });
    const expiredReceipt = await transactions.createIncomingTransactionApi(incoming({ itemId: item.id, batchNumber: 'B001', quantity: 10, unitCost: 5, date: '2025-01-10', expiryDate: EXPIRED_ON }));
    const validReceipt = await transactions.createIncomingTransactionApi(incoming({ itemId: item.id, batchNumber: 'B002', quantity: 20, unitCost: 7, date: '2025-01-11', expiryDate: '2099-12-31' }));
    return { itemId: item.id, expiredBatchId: expiredReceipt.batchId, validBatchId: validReceipt.batchId, expiredReceipt };
  };
  const batchOf = (item, batchId) => item.batches.find((batch) => batch.id === batchId);
  const valueReport = async (itemId) => {
    await signIn(ADMIN);
    const report = await reports.getReportApi('inventory_value', { from: '2000-01-01', to: '2099-12-31', itemId, page: 1, pageSize: 1000 });
    await signIn(STOREKEEPER);
    return report;
  };

  check('expiry is per batch: one expired batch leaves the item available through its valid batch', async () => {
    const { itemId, expiredBatchId, validBatchId } = await setUpMedicineA();
    const item = await findItem(itemId);
    assert.equal(item.status, 'available', 'the item is not expired or out of stock');
    assert.equal(item.archived, false);
    assert.equal(item.quantity, 20, 'available stock is the valid batch only');
    assert.equal(item.expiredQuantity, 10, 'expired stock is still recorded');
    assert.equal(item.disposedQuantity, 0);
    assert.equal(item.nearestExpiryDate, '2099-12-31', 'next expiry is that of the valid stock');

    const expired = batchOf(item, expiredBatchId);
    assert.deepEqual([expired.expiryStatus, expired.quantity, expired.availableQuantity, expired.expiredQuantity], ['expired', 10, 0, 10]);
    assert.deepEqual([expired.batchNumber, expired.unitCost, expired.expiryDate], ['B001', 5, EXPIRED_ON], 'batch details are kept');
    const valid = batchOf(item, validBatchId);
    assert.deepEqual([valid.expiryStatus, valid.quantity, valid.availableQuantity, valid.expiredQuantity], [null, 20, 20, 0]);
  });

  check('expired stock is excluded from available value, and reported separately', async () => {
    const { itemId } = await setUpMedicineA();
    const report = await valueReport(itemId);
    assert.equal(report.totals.incomingValue, 190, 'what was paid: 10×5 + 20×7');
    assert.equal(report.totals.stockValue, 126.67, 'available value: 20 × 6.3333');
    assert.equal(report.totals.expiredValue, 63.33, 'expired value: 10 × 6.3333');
    assert.equal(round2(report.totals.stockValue + report.totals.expiredValue), 190, 'nothing is lost or counted twice');
    assert.deepEqual([report.rows[0].quantity, report.rows[0].expiredQuantity, report.rows[0].totalValue], [20, 10, 126.67]);
    assert.equal(report.totals.outgoingValue, 0);
    assert.equal(report.totals.disposedValue, 0);
  });

  check('issuing: an expired batch is rejected, a valid batch of the same item works', async () => {
    const { itemId, expiredBatchId, validBatchId } = await setUpMedicineA();
    const issue = (overrides) => ({ itemId, quantity: 5, date: today, recipient: 'Ward', ...overrides });
    const error = await rejection(transactions.createOutgoingTransactionApi(issue({ batchId: expiredBatchId })), 422, 'batchId');
    assert.match(error.message, /expired on .* and cannot be issued/);
    // The limit is the selected batch, not the item's 30 in total.
    await rejection(transactions.createOutgoingTransactionApi(issue({ batchId: validBatchId, quantity: 21 })), 422, 'quantity');
    assert.equal((await findItem(itemId)).quantity, 20, 'rejected requests changed nothing');

    const saved = await transactions.createOutgoingTransactionApi(issue({ batchId: validBatchId }));
    assert.deepEqual([saved.reason, saved.recipient, saved.unitCost], ['issue', 'Ward', 6.3333]);
    const item = await findItem(itemId);
    assert.deepEqual([item.quantity, item.expiredQuantity], [15, 10]);
    // An edit cannot move an issue onto the expired batch either.
    await rejection(transactions.updateTransactionApi(saved.id, { type: 'outgoing', itemId, quantity: 5, date: today, batchId: expiredBatchId, recipient: 'Ward' }), 422, 'batchId');
  });

  check('dashboard: both roles get the same alerts, most severe first, and the chart keeps disposals apart', async () => {
    const { itemId, expiredBatchId } = await setUpMedicineA();
    const rank = (alert) => (alert.type === 'out_of_stock' ? 0 : alert.type === 'low_stock' ? 1 : alert.expiryStatus === 'expired' ? 2 : 3);
    const storekeeperAlerts = await dashboard.getCriticalAlertsApi({ limit: 5 });
    const ranks = storekeeperAlerts.map(rank);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'most severe first');
    await signIn(ADMIN);
    assert.deepEqual((await dashboard.getCriticalAlertsApi({ limit: 5 })).map((alert) => alert.id), storekeeperAlerts.map((alert) => alert.id));

    const month = today.slice(0, 7);
    const before = (await dashboard.getStockMovementApi()).find((entry) => entry.month === month);
    await transactions.createDisposalTransactionApi({ itemId, batchId: expiredBatchId, quantity: 4, date: today });
    const after = (await dashboard.getStockMovementApi()).find((entry) => entry.month === month);
    assert.equal(after.outgoing, before.outgoing, 'a disposal is not stock issued');
    assert.equal(after.disposed, before.disposed + 4);
  });

  check('disposal: reduces the expired quantity and the batch, and is recorded as a disposal', async () => {
    const { itemId, expiredBatchId, validBatchId } = await setUpMedicineA();
    const dispose = (overrides) => ({ itemId, batchId: expiredBatchId, quantity: 4, date: today, ...overrides });
    await rejection(transactions.createDisposalTransactionApi(dispose({ batchId: validBatchId })), 422, 'batchId');
    for (const quantity of [0, -1, null]) await rejection(transactions.createDisposalTransactionApi(dispose({ quantity })), 422, 'quantity');
    await rejection(transactions.createDisposalTransactionApi(dispose({ quantity: 11 })), 422, 'quantity');
    await rejection(transactions.createDisposalTransactionApi(dispose({ date: EXPIRED_ON })), 422, 'date');
    assert.equal((await findItem(itemId)).expiredQuantity, 10, 'rejected requests changed nothing');

    const saved = await transactions.createDisposalTransactionApi(dispose());
    assert.deepEqual([saved.type, saved.reason, saved.recipient, saved.quantity, saved.batchId, saved.unitCost], ['outgoing', 'expired_disposal', null, 4, expiredBatchId, 6.3333]);

    const item = await findItem(itemId);
    assert.deepEqual([item.quantity, item.expiredQuantity, item.disposedQuantity, item.status], [20, 6, 4, 'available'], 'available stock is untouched');
    const expired = batchOf(item, expiredBatchId);
    assert.deepEqual([expired.quantity, expired.expiredQuantity, expired.availableQuantity, expired.unitCost], [6, 6, 0, 5]);
    assert.equal(item.avgUnitCost, 6.3333, 'disposal does not change the Average Cost');

    assert.ok((await transactions.getOutgoingTransactionsApi({ itemId })).some((row) => row.id === saved.id && row.reason === 'expired_disposal'));
    assert.equal((await transactions.getOutgoingTransactionsApi({ search: 'expired stock disposal' })).length, 1);
    await rejection(transactions.updateTransactionApi(saved.id, { type: 'outgoing', itemId, quantity: 1, date: today, batchId: validBatchId, recipient: 'Ward' }), 409);
  });

  check('disposal: cannot exceed what is left, and the same stock cannot be disposed of twice', async () => {
    const { itemId, expiredBatchId } = await setUpMedicineA();
    const dispose = (quantity) => transactions.createDisposalTransactionApi({ itemId, batchId: expiredBatchId, quantity, date: today });
    await dispose(4);
    const error = await rejection(dispose(7), 422, 'quantity');
    assert.match(error.message, /Only 6 expired/);
    await dispose(6);
    const item = await findItem(itemId);
    assert.deepEqual([item.quantity, item.expiredQuantity, item.disposedQuantity], [20, 0, 10]);
    assert.equal(batchOf(item, expiredBatchId), undefined, 'the emptied batch holds no stock');
    await rejection(dispose(1), 422, 'batchId');
    await rejection(dispose(10), 422, 'batchId');
    assert.equal((await findItem(itemId)).disposedQuantity, 10, 'nothing was disposed of twice');
    assert.ok(!(await notifications.getNotificationsApi()).some((alert) => alert.batchId === expiredBatchId), 'the expired alert is gone');
  });

  check('disposal: history, original cost and report values stay intact and are not double-counted', async () => {
    const { itemId, expiredBatchId, expiredReceipt } = await setUpMedicineA();
    const disposal = await transactions.createDisposalTransactionApi({ itemId, batchId: expiredBatchId, quantity: 10, date: today });

    const receipt = (await transactions.getIncomingTransactionsApi({ itemId })).find((row) => row.id === expiredReceipt.id);
    assert.deepEqual(receipt, expiredReceipt, 'the original receipt is unchanged');
    assert.deepEqual([receipt.unitCost, receipt.quantity, receipt.expiryDate, receipt.status], [5, 10, EXPIRED_ON, 'active']);
    assert.ok((await inventory.getBatchLookupApi()).some((batch) => batch.id === expiredBatchId && batch.batchNumber === 'B001'), 'the batch record remains');

    const value = await valueReport(itemId);
    assert.deepEqual(
      [value.totals.incomingValue, value.totals.stockValue, value.totals.expiredValue, value.totals.disposedValue, value.totals.outgoingValue],
      [190, 126.67, 0, 63.33, 0],
      'the expired value moved from "awaiting disposal" to "disposed", once',
    );
    await signIn(ADMIN);
    const movement = await reports.getReportApi('movement_history', { from: '2000-01-01', to: '2099-12-31', itemId, page: 1, pageSize: 1000 });
    assert.deepEqual([movement.totals.incomingCount, movement.totals.outgoingCount, movement.totals.disposalCount, movement.totals.transactionsCount], [2, 0, 1, 3]);
    const row = movement.rows.find((entry) => entry.id === disposal.id);
    assert.deepEqual([row.type, row.reason, row.quantity, row.totalValue], ['outgoing', 'expired_disposal', 10, 63.33]);

    // Cancelling the disposal puts the stock back as expired stock, not as available stock.
    await signIn(STOREKEEPER);
    await transactions.cancelTransactionApi(disposal.id);
    const item = await findItem(itemId);
    assert.deepEqual([item.quantity, item.expiredQuantity, item.disposedQuantity], [20, 10, 0]);
  });

  check('expired and expiring-soon are separate everywhere, and all totals agree', async () => {
    const { itemId, expiredBatchId } = await setUpMedicineA();
    const soon = toISODate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
    const soonReceipt = await transactions.createIncomingTransactionApi(incoming({ itemId, batchNumber: 'B003', quantity: 8, unitCost: 7, date: '2025-01-12', expiryDate: soon }));

    const item = await findItem(itemId);
    assert.deepEqual([item.quantity, item.expiredQuantity], [28, 10]);
    assert.equal(batchOf(item, soonReceipt.batchId).expiryStatus, 'expiring_soon');
    assert.equal(item.nearestExpiryDate, soon);

    // One alert per batch, each with its own status; no duplicates.
    const alerts = (await notifications.getNotificationsApi()).filter((alert) => alert.itemId === itemId);
    assert.deepEqual(alerts.map((alert) => [alert.batchId, alert.expiryStatus, alert.quantity]).sort(), [[expiredBatchId, 'expired', 10], [soonReceipt.batchId, 'expiring_soon', 8]].sort());

    // Critical inventory: one expired row and one expiring-soon row, with their own quantities.
    const critical = (await dashboard.getCriticalInventoryApi()).filter((row) => row.itemId === itemId);
    assert.deepEqual(critical.map((row) => [row.status, row.quantity]).sort(), [['expired', 10], ['expiring_soon', 8]]);

    // Dashboard: seed has 2 items expiring soon and none expired; this item adds one to each.
    const summary = await dashboard.getDashboardSummaryApi();
    assert.deepEqual([summary.expiredCount, summary.expiringSoonCount], [1, 3]);
    assert.equal(summary.availableCount + summary.lowStockCount + summary.outOfStockCount, summary.totalItems);

    // Inventory list, Inventory Summary report and Inventory Value report show the same figures.
    await signIn(ADMIN);
    const query = { from: '2000-01-01', to: '2099-12-31', page: 1, pageSize: 1000 };
    const summaryReport = await reports.getReportApi('summary', query);
    const valueRows = await reports.getReportApi('inventory_value', query);
    const criticalReport = await reports.getReportApi('critical_items', query);
    const list = await inventory.getInventoryItemsApi();
    for (const listed of list) {
      const inSummary = summaryReport.rows.find((row) => row.itemId === listed.id);
      const inValue = valueRows.rows.find((row) => row.itemId === listed.id);
      assert.deepEqual([inSummary.quantity, inSummary.expiredQuantity, inSummary.status], [listed.quantity, listed.expiredQuantity, listed.status], listed.name);
      assert.deepEqual([inValue.quantity, inValue.expiredQuantity], [listed.quantity, listed.expiredQuantity], listed.name);
      assert.equal(inSummary.totalValue, inValue.totalValue, listed.name);
    }
    assert.equal(valueRows.totals.stockValue, round2(valueRows.rows.reduce((sum, row) => sum + row.totalValue, 0)));
    assert.deepEqual([criticalReport.totals.expired, criticalReport.totals.expiringSoon], [summary.expiredCount, summary.expiringSoonCount]);
    assert.deepEqual([summaryReport.totals.available, summaryReport.totals.lowStock, summaryReport.totals.outOfStock], [summary.availableCount, summary.lowStockCount, summary.outOfStockCount]);
  });

  check('quantities: only valid batches, only expired batches, and a mixture', async () => {
    await signIn(STOREKEEPER);
    // Only valid batches (seed Paracetamol: 300 + 200).
    const validOnly = await findItem(1);
    assert.deepEqual([validOnly.quantity, validOnly.expiredQuantity, validOnly.status], [500, 0, 'available']);
    assert.equal(validOnly.quantity, validOnly.batches.reduce((sum, batch) => sum + batch.availableQuantity, 0));

    // Only expired batches: nothing is available, everything is expired stock.
    const created = await inventory.createInventoryItemApi({ name: 'Expired Only', categoryId: 1, unit: 'box', minQty: 5 });
    await transactions.createIncomingTransactionApi(incoming({ itemId: created.id, batchNumber: 'X1', quantity: 40, date: '2025-01-10', expiryDate: '2025-03-01' }));
    await transactions.createIncomingTransactionApi(incoming({ itemId: created.id, batchNumber: 'X2', quantity: 60, date: '2025-01-11', expiryDate: '2025-04-01' }));
    const expiredOnly = await findItem(created.id);
    assert.deepEqual([expiredOnly.quantity, expiredOnly.expiredQuantity, expiredOnly.status, expiredOnly.nearestExpiryDate], [0, 100, 'out_of_stock', null]);

    // A mixture: each total is the sum of the matching batch quantities, and they do not overlap.
    const { itemId } = await setUpMedicineA();
    const mixed = await findItem(itemId);
    const sumOf = (key) => mixed.batches.reduce((sum, batch) => sum + batch[key], 0);
    assert.deepEqual([mixed.quantity, mixed.expiredQuantity], [sumOf('availableQuantity'), sumOf('expiredQuantity')]);
    assert.deepEqual([mixed.quantity, mixed.expiredQuantity], [20, 10]);
    assert.equal(mixed.quantity + mixed.expiredQuantity, sumOf('quantity'));
    for (const batch of mixed.batches) assert.equal(batch.availableQuantity + batch.expiredQuantity, batch.quantity);
  });

  check('disposing one expired batch leaves every other batch untouched; not disposing changes nothing', async () => {
    const { itemId, expiredBatchId, validBatchId } = await setUpMedicineA();
    const second = await transactions.createIncomingTransactionApi(incoming({ itemId, batchNumber: 'B004', quantity: 100, unitCost: 5, date: '2025-01-12', expiryDate: '2025-07-31' }));
    const before = await findItem(itemId);
    assert.deepEqual([before.quantity, before.expiredQuantity], [20, 110]);

    // Backing out of the confirmation means no request is sent: the data is exactly as it was.
    assert.deepEqual(await findItem(itemId), before);
    assert.equal((await transactions.getOutgoingTransactionsApi({ itemId })).length, 0);

    // What the batch row's Dispose button sends: the whole remaining quantity of that one batch.
    const target = batchOf(before, second.batchId);
    const saved = await transactions.createDisposalTransactionApi({ itemId, batchId: target.id, quantity: target.expiredQuantity, date: today });
    assert.deepEqual([saved.reason, saved.quantity, saved.batchId], ['expired_disposal', 100, second.batchId]);

    const after = await findItem(itemId);
    assert.equal(batchOf(after, second.batchId), undefined, 'the disposed batch holds no stock');
    assert.deepEqual(batchOf(after, expiredBatchId), batchOf(before, expiredBatchId), 'the other expired batch is unchanged');
    assert.deepEqual(batchOf(after, validBatchId), batchOf(before, validBatchId), 'the valid batch is unchanged');
    assert.deepEqual([after.quantity, after.expiredQuantity, after.disposedQuantity], [20, 10, 100]);
    assert.equal((await transactions.getOutgoingTransactionsApi({ itemId })).length, 1, 'recorded once');
    await rejection(transactions.createDisposalTransactionApi({ itemId, batchId: target.id, quantity: 1, date: today }), 422, 'batchId');
    await rejection(transactions.createDisposalTransactionApi({ itemId, batchId: expiredBatchId, quantity: 11, date: today }), 422, 'quantity');
  });

  check('an item with expired stock awaiting disposal cannot be deactivated', async () => {
    const { itemId, validBatchId, expiredBatchId } = await setUpMedicineA();
    await transactions.createOutgoingTransactionApi({ itemId, batchId: validBatchId, quantity: 20, date: today, recipient: 'Ward' });
    const item = await findItem(itemId);
    assert.deepEqual([item.quantity, item.expiredQuantity, item.status], [0, 10, 'out_of_stock']);
    const error = await rejection(inventory.archiveInventoryItemApi(itemId), 409);
    assert.match(error.message, /10 expired in stock awaiting disposal/);
    await transactions.createDisposalTransactionApi({ itemId, batchId: expiredBatchId, quantity: 10, date: today });
    assert.equal((await inventory.archiveInventoryItemApi(itemId)).archived, true);
  });

  // ---- Notifications ----------------------------------------------------------------------------

  check('notifications: read state belongs to each user', async () => {
    await signIn(STOREKEEPER);
    const [first] = await notifications.getNotificationsApi();
    const unreadBefore = await notifications.getUnreadNotificationsCountApi();
    assert.equal((await notifications.markNotificationReadApi(first.id)).read, true);
    assert.equal(await notifications.getUnreadNotificationsCountApi(), unreadBefore - 1);

    await signIn(ADMIN);
    assert.equal((await notifications.getNotificationsApi()).find((entry) => entry.id === first.id).read, false);
    await notifications.markAllNotificationsReadApi();
    assert.equal(await notifications.getUnreadNotificationsCountApi(), 0);

    await signIn(STOREKEEPER);
    assert.equal(await notifications.getUnreadNotificationsCountApi(), unreadBefore - 1);
    await rejection(notifications.markNotificationReadApi('no-such-alert'), 404);
  });

  for (const { name, run } of checks) {
    await reset();
    try {
      await run();
      console.log(`  ok    ${name}`);
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  ${name}\n        ${String(error.message).split('\n').join('\n        ')}`);
    }
  }
  console.log(`\n${checks.length - failures} of ${checks.length} service checks passed.`);
} finally {
  await server.close();
}

process.exit(failures ? 1 : 0);
