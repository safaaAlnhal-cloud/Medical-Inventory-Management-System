# MediTrack Frontend

MediTrack is a React/Vite frontend for a medical inventory management graduation project.
It currently runs entirely on mock data; there is no backend yet.

## Architecture

```
Pages / Components  ->  Services  ->  Mock database        (now)
Pages / Components  ->  Services  ->  REST API -> Database (later)
```

Pages and components only call service functions. When the backend is ready, set
`VITE_USE_MOCK_DATA=false` and the same pages talk to the real API. See `BACKEND_HANDOFF.md`
for the full endpoint contract.

## Project structure

| Folder | Purpose |
|---|---|
| `src/pages` | One file per screen (`landing`, `auth`, `admin`, `storekeeper`, `shared`). Pages load data through services and render it |
| `src/components/layout` | `AppLayout` (sidebar, navbar, page outlet) shared by every signed-in page |
| `src/components/common` | Reusable UI: `Modal`, `ConfirmDialog`, `PageHeader`, `StatCard`, `FormField`, `InlineAlert`, `ErrorBoundary`, loading/empty/error states |
| `src/components/dashboard` | Pieces shared by the admin and storekeeper dashboards |
| `src/components/landing`, `src/styles` | The public landing page's logo and its own styles |
| `src/context` | `AuthContext` (signed-in user), `NotificationsContext` (unread count), `ToastContext` (success/error messages) |
| `src/hooks` | `useAsyncData` (loading/error state), `useDashboardData` (independent dashboard sections), `useLookups` (id to name), `useSearchQuery`, `useCreateParam` |
| `src/services` | The data layer. One `*Api.js` per domain, plus the HTTP client and error type |
| `src/services/mock` | The in-memory mock database used while there is no backend |
| `src/mockData` | Seed data for the mock database |
| `src/constants`, `src/utils` | Roles, units, stock rules, formatters and other pure helpers |
| `src/routes` | Route table, `ProtectedRoute` and `RoleGuard` |
| `scripts` | `service-checks.mjs`: service-level checks of the data layer's rules (`npm run check:services`) |

## Data conventions

- Entities reference each other by id (`itemId`, `categoryId`, `batchId`, `recordedBy` is a user id).
  A batch number is only a display label; `batchId` is the unique identifier.
- Average Cost is a running weighted average: incoming stock updates it, outgoing stock does not.
  An outgoing transaction stores the Average Cost at the time as its Unit Cost. The calculation
  lives only in the mock layer (`src/services/mock/mockSelectors.js`) until the backend exists.
- Items are never deleted. They are archived, which the UI calls **Deactivated**: the item leaves
  the active inventory and the item lists for new transactions, while its transactions, batches
  and report history are kept. An item can only be deactivated once its stock is 0, and can be
  reactivated from the Inventory page's Deactivated view. The code and API keep the word "archive"
  (`archived`, `archivedAt`). See "Archived items" in `BACKEND_HANDOFF.md`.
- Expiry belongs to a batch, not an item. An expired batch's stock is not available stock, is
  left out of the available value and cannot be issued; it stays recorded until an "Expired Stock
  Disposal" is recorded for it (Inventory page: open the item's batches and press Dispose on the expired batch). An item with a valid batch
  stays available. See "Batch expiry and disposal" in `BACKEND_HANDOFF.md`.
- Transactions are never deleted. A cancelled transaction stays in the list with a Cancelled badge
  but is excluded from stock, Average Cost, dashboards, notifications and reports.
- An active transaction can be edited in full (type, item, quantity, batch, costs, dates). The
  data layer validates the edit and applies it all or nothing; see "Editing transactions" in
  `BACKEND_HANDOFF.md`.
- Quantities and prices are numbers; dates are ISO strings. All formatting happens in the UI (`src/utils/formatters.js`).
- Roles are `admin` / `storekeeper`; user status is `active` / `inactive`.
- Stock and expiry rules have one definition: `src/utils/stock.js`.

## Sign-in

- The signed-in user comes from `useAuth()`. Nothing is tied to a hardcoded account.
- **Remember me** checked: the session is kept in `localStorage` and survives closing the browser.
  Unchecked: it is kept in `sessionStorage` and ends when the tab is closed.
- Inactive accounts cannot sign in. A session that the data layer rejects (401) ends, and the login
  page says so.
- There is no password reset by email. An admin sets a new password for a user from the Users page.
- Mock sign-in is a development stand-in, not security: demo passwords are plain text in
  `src/mockData/usersMock.js` and the mock token is unsigned.

Demo accounts (development only, mock mode only):

- Admin: `sara@medcenter.ps` / `admin123`
- Storekeeper: `omar@medcenter.ps` / `store123`

## Mock data behaviour

The mock database is seeded from `src/mockData` and stored in `sessionStorage`, so your changes
survive a page refresh and reset when you close the browser tab. Stock levels, batches, dashboard
numbers, notifications and reports are all calculated from the same items and transactions.

## Global search

The Navbar search is page-aware and stores the query in `?q=`. List pages pass it to their
service, so the backend can handle the same parameter later.

## Run

```bash
npm install
npm run dev
```

Other scripts: `npm run lint`, `npm run build`, `npm run check:services`.

`npm run check:services` calls the service functions against the seed data and checks the business
rules (archiving and restoring, validation, stock limits, transaction and report values, roles,
notification read state). It needs no extra dependency and does not open a browser. There are no
UI tests.

Environment (copy `.env.example` to `.env`):

- `npm run dev` uses mock data unless `VITE_USE_MOCK_DATA=false`.
- A production build (`npm run build`) uses the **real API** unless `VITE_USE_MOCK_DATA=true`, so a
  deployed build never runs on mock data by accident. **To build a demo that runs on mock data,
  set `VITE_USE_MOCK_DATA=true` before building.**

```env
# While the backend is under development (also required for a mock-data demo build)
VITE_USE_MOCK_DATA=true

# After backend integration
VITE_USE_MOCK_DATA=false
VITE_API_BASE_URL=http://localhost:5000/api
```
