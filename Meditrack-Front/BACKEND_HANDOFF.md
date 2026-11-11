# MediTrack Frontend — Backend Handoff

This document is the contract between the React frontend and the future backend. It lists every
endpoint the frontend calls, the request and response shapes it expects, and the business rules
the backend must enforce.

## 1. How the frontend talks to data

```
Pages / Components  ->  Services (src/services/*Api.js)  ->  Mock database        (now)
Pages / Components  ->  Services (src/services/*Api.js)  ->  REST API -> Database (later)
```

- Pages and components only call service functions. They never import mock data.
- Every service function has two branches, selected in `src/services/request.js`:
  `api` (real HTTP call) and `mock` (same result from the in-memory mock database).
- Each service maps the response through a small mapper (`mapUser`, `mapItem`, ...). If a backend
  field is named differently, change the mapper in that one service file. Pages are not affected.

### How to read this document

Every statement belongs to one of these kinds, and the text says which:

| Label | Meaning |
|---|---|
| **Implemented** | The frontend does this today, in both mock and API mode |
| **Mock only** | Simulated in the browser so the UI can be developed. It is not real and gives no security |
| **Backend must** | The frontend relies on it, but only a server can really do it |
| **Open decision** | Not settled. Section 8 lists them all; the mock uses the safest non-destructive behaviour |
| **Planned** | Decided, and the backend follows it, but the frontend change it needs has not been made yet |
| **Deferred** | Discussed and postponed on purpose. Nothing is built for it: no field, table or endpoint |

The backend is a Laravel 13 application in `Meditrack-Back` (MySQL, Laravel Sanctum tokens).
Decisions taken for it are recorded in section 8 and in the sections they affect; the database
design is in section 9.

**Requirements added after the supervisor's review** (decisions 19–27 in section 8): factory
barcodes and manufacturers, extra item details, manufacturing date and optional supplier on
batches, archive reason and history, account expiry, alert priority, backend report export with an
export log. Insurance support and changing one's own email are **deferred**. Everything they need
in the frontend is **planned**; none of it is implemented yet.

### Service files

| File | Responsibility |
|---|---|
| `src/services/request.js` | The one switch between `api` and `mock`. In mock mode it also runs the mock's 401 / 403 checks |
| `src/services/apiAxios.js` | Axios client: base URL, bearer token header, 20 s timeout, central 401 handling, `unwrap` |
| `src/services/apiError.js` | `ApiError` (the only error type pages see), Axios error conversion, field-error helpers |
| `src/services/authStorage.js` | Where the session `{ token, user }` is kept (local or session storage) |
| `src/services/authApi.js` | Login, current user, logout |
| `src/services/usersApi.js` | Users list and directory, create, update, admin password reset |
| `src/services/profileApi.js` | The signed-in user's own profile and password |
| `src/services/categoriesApi.js` | Categories CRUD |
| `src/services/manufacturersApi.js` | Manufacturers list and search (for the manufacturer autocomplete) |
| `src/services/inventoryApi.js` | Items: list, archived list, lookups, create, update, archive, restore |
| `src/services/transactionsApi.js` | Incoming / outgoing transactions: list, create, edit, cancel, batch options |
| `src/services/notificationsApi.js` | Alerts and their per-user read state |
| `src/services/dashboardApi.js` | Dashboard summary, stock movement, critical inventory, alerts, recent transactions |
| `src/services/reportsApi.js` | The four reports |
| `src/services/mock/mockDb.js` | **Mock only.** The in-memory database, mock token and mock authorization |
| `src/services/mock/mockSelectors.js` | **Mock only.** Derived values: stock, batches, Average Cost, alerts, transaction value |

### Environment and switching to the real backend

| Variable | Values | Effect |
|---|---|---|
| `VITE_USE_MOCK_DATA` | `true` | Mock data, also in a production build (use this for a demo build) |
| | `false` | Real API |
| | not set | Mock data under `npm run dev`; **real API in a production build** |
| `VITE_API_BASE_URL` | URL | Base URL of the API. Default `http://localhost:5000/api`; the Laravel backend serves it at `http://localhost:8000/api` (`php artisan serve`), so set this value in `.env` |

A production build therefore never falls back to fake data by accident: mock mode has to be asked
for. To go live:

```env
VITE_USE_MOCK_DATA=false
VITE_API_BASE_URL=https://your-api.example/api
```

No page or component needs to change. Neither variable is a secret; nothing secret belongs in a
`VITE_` variable, because all of them are readable in the browser bundle.

Known limitation: the mock layer and its demo accounts are still compiled into the bundle in API
mode (they are just never called). Excluding them needs the services to load the mock lazily.

## 2. General conventions

| Topic | Convention |
|---|---|
| Base URL | `VITE_API_BASE_URL`, e.g. `http://localhost:8000/api` |
| Format | JSON request and response bodies |
| Response body | The resource itself, with no envelope. If you prefer `{ "data": ... }`, tell the frontend team: it is a one-line change in `unwrap` in `src/services/apiAxios.js` |
| IDs | Any stable unique value (number or string). Entities reference each other by id only |
| Dates | ISO 8601. Date-only fields are `YYYY-MM-DD`; timestamps are full ISO strings (`2026-10-08T10:15:00.000Z`) |
| Numbers | Quantities, prices and totals are JSON numbers, never formatted strings. **Quantities (and `minQty`) are whole numbers** |
| Money | US dollars (`$`). The UI shows 2 decimals with one currency symbol, defined once in `src/utils/formatters.js` (`CURRENCY_SYMBOL`). Unit costs are stored and returned with 4 decimals; totals are rounded to 2 (see "Average Cost and Unit Cost") |
| Time zone | Date-only values are calendar dates with no time zone. "Today" (expiry, report periods, the "no future date" rule) is the date in **`Asia/Gaza`**, decided by the server. The mock uses the browser's local date |
| Roles | `"admin"` or `"storekeeper"` (the frontend lowercases whatever it receives; any other value is rejected) |
| User status | `"active"` or `"inactive"` |
| Units | `"box"`, `"strip"`, `"bottle"`, `"vial"`, `"ampoule"`, `"piece"`, `"pack"` |
| Empty success | Actions with nothing to return (delete, change password, mark all read) may respond `204 No Content` |

The backend must **not** return presentation data: no formatted strings (`"$1,200"`, `"+20 boxes"`,
`"Today, 10:15 AM"`), no chart angles, no card titles. The frontend formats everything.

### Authentication

- `POST /auth/login` returns a token. Every other request sends `Authorization: Bearer <token>`.
- All endpoints except login require a valid token and return `401` without one.
- **Implemented:** a `401` on any endpoint other than login makes the frontend sign the user out,
  go to the login page and show "Your session has ended. Please sign in again." Other error codes
  never sign the user out.
- **Backend must** answer `401` (not `403`) when the token belongs to an account that has been
  deactivated **or has expired** (see "Account expiry" in section 4.2), so that user is signed out
  instead of staying on screen with every request failing.
- **Implemented:** when the app starts with a stored session it calls `GET /auth/me` once and
  replaces the stored name and role with the server's answer. The stored copy only decides what
  the UI shows until then.
- **Implemented:** signing out calls `POST /auth/logout` (best effort) and clears the session
  locally whether or not the call succeeds.
- **Backend must** do every role check itself. The frontend hides admin pages and buttons from
  storekeepers, but that is not a security boundary: the role in the browser can be edited. The
  "Access" column below lists who may call each endpoint.
- **Backend must** take the acting user from the token. The frontend never sends a user id to
  say who is acting (`recordedBy`, `cancelledBy` and the profile endpoints all rely on the token).
- **Decided:** the token is a Laravel Sanctum personal access token, an opaque string the frontend
  never reads. It expires **24 hours** after sign-in, or **30 days** when "Remember me" is checked
  (`remember` in the login request, section 4.1). An expired token gets `401`. There is no refresh:
  the user signs in again. The token stays in `localStorage` / `sessionStorage` as today.

Route and role structure (**implemented**, `src/routes`):

| Path | Who | Page |
|---|---|---|
| `/` | Public | Landing page |
| `/login` | Public (a signed-in user is sent to their dashboard) | Login |
| `/admin/dashboard`, `/admin/inventory`, `/admin/transactions`, `/admin/users`, `/admin/reports`, `/admin/notifications`, `/admin/settings` | Admin | |
| `/storekeeper/dashboard`, `/storekeeper/inventory`, `/storekeeper/transactions`, `/storekeeper/notifications`, `/storekeeper/profile` | Storekeeper | |
| `/storekeeper/reports` | Storekeeper | **Planned:** the same Reports page, with all four reports, linked from the storekeeper sidebar |

A signed-out user is sent to `/login`; a user opening the other role's path is sent to their own
dashboard. Inventory, Transactions and Notifications are the same pages for both roles, and so
will Reports be.

### Error format

Any non-2xx response should have this body:

```json
{ "message": "Human-readable message shown to the user", "errors": { "email": "Email is already in use." } }
```

`errors` (per-field messages) is optional. **Implemented:** the item, transaction and user forms
show each message under the input whose name matches the key; a failure without `errors` shows
`message` above the form. The keys the forms understand are the request field names:

| Form | Keys |
|---|---|
| Item | `name`, `categoryId`, `unit`, `minQty`; **planned:** `activeIngredient`, `strength`, `dosageForm`, `storageConditions`, `uses`, `description` |
| Transaction | `type`, `itemId`, `quantity`, `unitCost`, `date`, `expiryDate`, `batchNumber`, `supplier`, `manufacturer`, `manufacturingDate`, `batchId`, `recipient` |
| User | `name`, `email`, `password`, `status`, `newPassword`; **planned:** `accountExpiresOn` |
| Barcode (**planned**) | `barcode`, `manufacturer` |
| Archive item (**planned**) | `reason` |

**Planned (all forms):** every required input shows a red `*` after its label and each form
has a short "* Required" note; every optional input says "(optional)". The required / optional
split of each form is listed with its endpoint in section 4, and the frontend checks must match
the backend rules there exactly.

If `message` is missing, the frontend shows a generic message for the status code. A request that
gets no answer within 20 seconds is reported as a timeout. Statuses the frontend expects:

| Status | Meaning |
|---|---|
| 400 / 422 | Validation failed |
| 401 | Missing, invalid or expired token, deactivated or expired account (or wrong credentials on login) |
| 403 | Authenticated but not allowed (wrong role; inactive or expired account **at login**) |
| 404 | Record not found |
| 409 | Conflict (duplicate email or name, category still in use, item still has stock, already cancelled / archived) |
| 5xx | Server error |

## 3. Data models

### User
```json
{ "id": 2, "name": "Omar Saleh", "email": "omar@medcenter.ps", "role": "storekeeper",
  "status": "active", "phone": "", "lastActiveAt": "2026-10-08T09:40:00.000Z", "transactionsCount": 8 }
```
`transactionsCount` is the number of active (not cancelled) transactions whose `recordedBy` is this user.
Passwords are never returned by any endpoint.

**Planned** fields (account expiry, decision 23):
```json
{ "accountExpiresOn": "2026-12-31", "accountExpired": false }
```
- `accountExpiresOn` is the **last day** the account can be used (`YYYY-MM-DD`), or `null` for
  an account that does not expire. It is always `null` for the admin.
- `accountExpired` is derived: `true` once today (`Asia/Gaza`) is after `accountExpiresOn`.
  It is separate from `status`: an expired account can still be `active` and works again as soon
  as the admin moves the date forward. The Users page shows an "Expired" badge for it.

### Category
```json
{ "id": 1, "name": "Medications" }
```

### Inventory item
```json
{ "id": 1, "name": "Paracetamol 500mg", "categoryId": 1, "unit": "box", "minQty": 20,
  "quantity": 500, "expiredQuantity": 0, "disposedQuantity": 0, "status": "available",
  "avgUnitCost": 12.5, "nearestExpiryDate": "2027-12-12",
  "batches": [
    { "id": 5, "batchNumber": "PC-101", "quantity": 300, "availableQuantity": 300, "expiredQuantity": 0,
      "unitCost": 12, "supplier": "PharmaCo", "expiryDate": "2027-12-12", "expiryStatus": null }
  ],
  "archived": false, "archivedAt": null }
```
- `name`, `categoryId`, `unit`, `minQty`, `archived`, `archivedAt` are stored on the item.
  Everything else is derived:
  - `batches` lists the item's batches with `quantity > 0` (see Batch below);
  - `quantity` is the item's **available** stock: the sum of its batches' `availableQuantity`.
    `expiredQuantity` is expired stock awaiting disposal and `disposedQuantity` what disposals
    have already removed (see "Batch expiry and disposal" below);
  - `status` is the stock status (`available`, `low_stock`, `out_of_stock`) and each batch's
    `expiryStatus` is `expired`, `expiring_soon` or `null`, by the rules in "Stock and expiry rules".
    **Backend should** return both so every page agrees with the server's idea of "today".
    If a field is left out, the service works it out with the same rule (`src/utils/stock.js`),
    so pages never calculate a status themselves;
  - `avgUnitCost` is the running Average Cost (see "Average Cost and Unit Cost" below);
  - `nearestExpiryDate` is the earliest `expiryDate` among batches with **available** stock, or
    `null`. An expired batch is not counted: it is no longer about to expire.
- `archived` / `archivedAt`: see "Archived items" below.

**Planned** item fields (decisions 19, 21, 22):
```json
{ "activeIngredient": "Paracetamol", "strength": "500 mg", "dosageForm": "Tablet",
  "storageConditions": "Store below 25°C", "uses": "Pain and fever relief", "description": null,
  "barcodes": [ { "id": 3, "barcode": "6251234567890", "manufacturerId": 2 } ],
  "archiveReason": null, "archivedBy": null, "archiveHistoryCount": 0 }
```
- The six detail fields are optional text, stored on the item, because they are the same for
  every box of it. They are all optional because the inventory also holds supplies (gloves,
  cotton), not only medicines. Limits: `activeIngredient` 150 characters, `strength` 50,
  `dosageForm` 50, `storageConditions` 255, `uses` 1000, `description` 2000. **Decided:**
  `dosageForm` is free text, not a fixed list.
- **No manufacturer, manufacturing date or expiry date on the item**: they belong to a batch,
  because the same item is received from different manufacturers.
- `barcodes` lists the item's factory barcodes, each with its manufacturer (see "Barcodes and
  manufacturers" below). Archived items keep theirs.
- `archiveReason` / `archivedBy` (user id) describe the current archiving and are `null` while the
  item is active. `archiveHistoryCount` is the number of times it has been archived; the History
  button shows only when it is above 0 (see "Archived items").

### Batch
```json
{ "id": 5, "itemId": 1, "batchNumber": "PC-101", "unitCost": 12, "supplier": "PharmaCo", "expiryDate": "2027-12-12" }
```
**Implemented** on incoming transactions (mock and API): `"manufacturerId": 2` and
`"manufacturingDate": "2025-12-01"`, both `null` when unknown, and `supplier` is **optional**
(`null` for donations and stock with no commercial supplier); the UI shows "—" for it.
**Planned:** these three also appear on each batch inside an item (`GET /inventory`).
- `id` is the **unique internal identifier** of the batch. Transactions and notifications
  reference a batch by this id (`batchId`), never by its number.
- `batchNumber` is the label the manufacturer printed on the box; the system never generates one.
  It is only displayed to users. **Decided (decision 20):** it is unique per **item and
  manufacturer** among batches with an active receipt, so two manufacturers may use the same
  number for the same item. Batches with no manufacturer form one group of their own. Two
  different items may always use the same number.
- `itemId` links the batch to its item.
- A batch is created by one incoming transaction and keeps the purchase price (`unitCost`),
  supplier and expiry date it was received with.
- A batch's `quantity` (shown inside an item) is what was received into it minus what has been
  issued from it.

### Transaction
```json
{ "id": 18, "type": "incoming", "itemId": 4, "batchId": 10, "quantity": 135, "date": "2026-10-02",
  "createdAt": "2026-10-02T06:40:00.000Z", "recordedBy": 1,
  "unitCost": 4.5, "supplier": "BioLab", "expiryDate": "2026-10-28",
  "status": "active", "cancelledAt": null, "cancelledBy": null }
```
```json
{ "id": 19, "type": "outgoing", "itemId": 4, "batchId": 10, "quantity": 15, "date": "2026-10-04",
  "createdAt": "2026-10-04T10:05:00.000Z", "recordedBy": 2,
  "unitCost": 4.5, "recipient": "Surgery Ward", "reason": "issue",
  "status": "cancelled", "cancelledAt": "2026-10-06T08:30:00.000Z", "cancelledBy": 1 }
```
- `itemId` references an inventory item; `batchId` references the batch the stock was received
  into or issued from; `recordedBy` is the **user id** of the person who recorded it.
- Transactions do not carry a batch number. The frontend resolves `batchId` to the number through
  `GET /inventory/batches/lookup`.
- `date` is the business date chosen in the form; `createdAt` is when the record was saved (used
  for "newest first" and for the order in which the Average Cost is built up).
- `supplier`, `expiryDate` exist on incoming only (`expiryDate` may be `null`). `recipient` exists on outgoing only.
  **Implemented:** incoming also carries `manufacturerId` and `manufacturingDate` (both may be
  `null`), and `supplier` may be `null`. Like `supplier` and `expiryDate`, they are read from the
  batch the transaction received.
- `reason` exists on outgoing only: `"issue"` (usable stock given to `recipient`) or
  `"expired_disposal"` (expired stock removed from its batch; `recipient` is `null`). If it is
  missing the frontend treats the transaction as an issue. See "Batch expiry and disposal".
- `unitCost` exists on both types, as a number:
  - incoming: the purchase price entered by the user;
  - outgoing: the item's `avgUnitCost` **at the moment the transaction was created**. The backend
    sets it when saving and stores it on the transaction. It must never be recalculated later,
    so receiving a new batch at a different price does not change past outgoing transactions.
- `status` is `"active"` or `"cancelled"`. `cancelledAt` (timestamp) and `cancelledBy` (user id)
  are `null` until the transaction is cancelled. See "Cancelled transactions" below.
- `revisionsCount` (**planned** in the frontend) is the number of times the transaction has been
  edited, `0` if never. The Transactions page shows a History button only when it is above 0.
  See "Edit history" below.

### Notification
```json
{ "id": "expiring-9", "type": "expiring", "itemId": 2, "quantity": 15, "minQty": null,
  "batchId": 9, "expiryDate": "2026-10-20", "expiryStatus": "expiring_soon",
  "createdAt": "2026-10-08T07:55:00.000Z", "read": false }
```
- `type` is `"low_stock"`, `"out_of_stock"` or `"expiring"`.
- `expiring` notifications are per batch and carry `batchId`, `expiryDate`, the batch `quantity`
  and `expiryStatus`: `"expired"` or `"expiring_soon"`. An expired batch is never reported as
  merely expiring: the UI words it "has expired" and shows it in red. For the other two types
  `batchId`, `expiryDate` and `expiryStatus` are `null`, and `quantity` / `minQty` are the item's.
- The frontend writes the title and description from these fields.
- Read state is stored **per user**: one user reading an alert leaves it unread for the others.
- Section 4.6 lists which alerts exist and when.

**Planned:** account alerts (decision 23) use the same shape with two new types,
`account_expiring` and `account_expires_today`. They carry `userId` (the account concerned),
`accountExpiresOn` and `daysLeft`; `itemId`, `batchId`, `quantity`, `minQty`, `expiryDate` and
`expiryStatus` are `null`. Stock and expiry alerts carry `userId: null`.
```json
{ "id": "account_expiring-3", "type": "account_expiring", "userId": 3, "accountExpiresOn": "2026-11-14",
  "daysLeft": 5, "itemId": null, "batchId": null, "quantity": null, "minQty": null,
  "expiryDate": null, "expiryStatus": null, "createdAt": "2026-11-09T07:00:00.000Z", "read": false }
```

### Manufacturer
```json
{ "id": 2, "name": "PharmaCo" }
```
A company that makes the products. Linked to batches and to barcodes, never to an item.
**Implemented:** the list and search, `GET /manufacturers` (section 4.4), in both mock and API
mode (`getManufacturersApi` in `src/services/manufacturersApi.js`). **Implemented:** a manufacturer
is created from the Incoming form (section 4.5), which suggests the existing names as the user types.

### Barcodes and manufacturers (planned)

**Decided (decisions 19–21).** The system reads the **factory barcode** printed on the box. It
does not generate or print QR codes or barcodes of its own.

- **One item, many manufacturers.** The same product from different manufacturers stays **one
  item**, with one stock figure and one Average Cost (decision 16 is unchanged). The manufacturer
  is recorded on each **batch**.
- **One item, many barcodes.** Each manufacturer prints its own barcode, so an item can have
  several. Each barcode is linked to its item **and** its manufacturer:
  `{ "id", "barcode", "manufacturerId" }` in the item's `barcodes`.
- **A different pack size is a different item** ("Paracetamol 500mg ×10" and "×20"): every
  barcode of an item must stand for the same unit, otherwise a quantity of "10 boxes" would mean
  different amounts. The item form says so next to the barcode list.
- **A barcode is unique in the whole system**, archived items included. Scanning a barcode of an
  archived item finds that item and the UI says it is deactivated; it cannot be selected for a
  transaction until it is restored.
- **Barcodes of an archived item cannot be added or removed** (`409`) until it is restored.
- **Unknown barcode.** If a scan matches nothing, the Incoming form offers "Link this barcode": the
  user picks the item and the manufacturer, and the barcode is saved
  (`POST /inventory/:id/barcodes`). The next scan finds it.
- A barcode is reference data, not history: nothing points at it, so removing one
  (`DELETE /inventory/:id/barcodes/:barcodeId`) is allowed. To change one, remove it and add the
  new one.
- Barcode text: required, trimmed, 1–64 characters, no spaces. Barcodes are compared exactly.

**Manufacturers** are created from the Incoming form (and from "Link this barcode"), never on a
page of their own:

- The manufacturer input suggests the existing names as the user types (`GET /manufacturers`).
- A name that matches no existing manufacturer creates one, in the same database transaction as
  the receipt, so a rejected receipt leaves no new manufacturer behind.
- **Duplicates by spelling are prevented** by comparing a normalised form of the name: lowercase,
  with spaces and punctuation removed. "PharmaCo", "pharmaco" and "Pharma Co." are one
  manufacturer, kept under the spelling first entered. **Decided:** letter case, spaces, dots and
  commas (and other punctuation) are all ignored when comparing names.
- Requests send the manufacturer **by name** (`"manufacturer": "PharmaCo"`); responses and edit
  history carry `manufacturerId`, resolved to a name through `GET /manufacturers`.

**Scanning (planned, frontend).** Inventory search, Incoming and Outgoing get a "Scan" input:

- A USB / Bluetooth barcode scanner types the code and presses Enter, so a plain text input
  supports it with no library; the same input accepts a typed code.
- A camera button opens the device camera (a JavaScript barcode library). Browsers allow the
  camera only on `https://` or `http://localhost`.
- Incoming: a scan selects the item and fills the manufacturer.
- Outgoing: a scan (or choosing a manufacturer) selects the item and that manufacturer. **Decided:**
  the batch list then shows that manufacturer's available batches first, nearest expiry first,
  followed by the other available batches; the user may still pick any batch. The order comes
  from the backend (`manufacturerId` on the batch-options endpoints, section 4.5), because the
  frontend never sorts. The first batch in the list is preselected.

### Average Cost and Unit Cost

The backend is the source of truth for these values. The frontend only displays what the API
returns; no page or component calculates a cost.

**Average Cost (`avgUnitCost` on an item)** is a **running (moving) weighted average**, built up
over the item's transactions in the order they were recorded (`createdAt`):

```
On an incoming transaction:
  Average Cost = (stock quantity × Average Cost + received quantity × unit price)
                 ÷ (stock quantity + received quantity)

On an outgoing transaction:
  stock quantity goes down. Average Cost does NOT change.
```

Worked example:

| Step | Stock | Average Cost |
|---|---|---|
| Receive 10 at $5 | 10 | $5.00 |
| Receive 20 at $8 | 30 | (10×5 + 20×8) ÷ 30 = **$7.00** (not (5+8) ÷ 2) |
| Issue 5 | 25 | $7.00 (unchanged) |
| Receive 15 at $9 | 40 | (25×7 + 15×9) ÷ 40 = **$7.75** |

- Which batch the stock is issued from does not affect the Average Cost.
- An item whose stock reaches 0 keeps its last Average Cost. The next receipt then sets the
  Average Cost to that receipt's price. An item that has never received stock has 0.
- Stock value (reports) is `quantity × avgUnitCost`, rounded to 2 decimals.
- **Rounding.** A unit cost (the Average Cost, and the snapshot stored on an outgoing
  transaction) is kept to 4 decimals and only shortened to 2 for display. Totals (transaction
  value, stock value, report totals) are rounded to 2 decimals. Rounding the Average Cost to 2
  decimals before multiplying loses cents: 3 at $10 + 4 at $11 is $74.00, but 7 × $10.57 is $73.99.
  **Decided:** the database stores unit costs as `DECIMAL(12,4)`; the rule to keep is
  "round the total, not the unit cost".
- **Transaction value** is always `quantity × unitCost` using the `unitCost` stored on that
  transaction, for both types. It is calculated in one place
  (`selectTransactionValue` in `src/services/mock/mockSelectors.js`) and reused by Movement
  History and by the incoming / outgoing value totals, so they cannot disagree. A transaction
  whose cost is missing has no value (`null`, shown as "—"), never a made-up 0.

**Unit Cost on an outgoing transaction** is a historical snapshot:

1. The request carries no cost.
2. When saving, the backend reads the item's current Average Cost and stores it as the
   transaction's `unitCost`.
3. It is never recalculated. If the Average Cost later becomes $8, an earlier outgoing
   transaction saved at $7 still returns `unitCost: 7`.

Until the backend exists, the frontend simulates this in one place:
`calculateAverageCost` and `selectItem` in `src/services/mock/mockSelectors.js`, and the batch
creation and cost snapshot in `createMock` in `src/services/transactionsApi.js`. That code runs
only when `VITE_USE_MOCK_DATA` is not `false`; in API mode it is bypassed entirely.

### Archived items

"Deleting" an item in the UI **archives** it. Nothing is ever removed from the data.

**Wording.** The UI calls an archived item **"Deactivated"** and restoring it **"Reactivate"**
(the Inventory switch is Active / Deactivated; the action button is "Deactivate Item"). That is
display text only. The data model, service functions and endpoints keep the word "archive"
(`archived`, `archivedAt`, `/inventory/archived`, `/archive`, `/restore`), and this document uses
"archived" throughout. Error messages shown to users should say "deactivated".

**Implemented** (pages) and **mock only** (rules, until the backend enforces them):

- Archiving sets `archived: true` and `archivedAt` (timestamp) on the item. The item keeps its
  id, name, category, batches and every transaction.
- **An item can only be archived while its stock is 0.** `PATCH /inventory/:id/archive` returns
  `409` otherwise, with a message telling the user to issue or correct the remaining stock first.
  Archiving therefore can never make stock or stock value disappear from the inventory.
  (Whether the backend should instead allow it and keep the stock is an open decision; refusing
  is the non-destructive choice.)
- **Active inventory** means items that are not archived. Archived items are left out of
  `GET /inventory`, its search, the item selectors for new transactions, the dashboard summary,
  critical inventory, alerts / notifications, and the rows and stock value of the Inventory
  Summary, Critical Items and Inventory Value reports.
- **History** keeps them. Their transactions stay in the transaction lists, Movement History,
  the incoming / outgoing value totals, the dashboard stock movement and recent transactions,
  and each user's `transactionsCount`. `GET /inventory/lookup` still returns them (with
  `archived: true`) so their name resolves, and the item filters on the Transactions and Reports
  pages list them marked "(deactivated)".
- **No new transaction** can be recorded for an archived item (`422`, field `itemId`).
- **Its existing transactions are read-only:** editing or cancelling one returns `409`, because
  either would change the stock of an item that is not in the inventory. The Transactions page
  disables both buttons for those rows. Restoring the item makes them editable again.
- An archived item cannot be edited (`409`) or archived twice (`409`).
- **Restoring** (`PATCH /inventory/:id/restore`) clears both fields. The item is back in the
  active inventory with all of its history. It returns `409` if an active item now has the same
  name: the item name is unique among active items only, so a name can be reused after archiving,
  and one of the two has to be renamed before both can be active.
- A category cannot be deleted while any item, **active or archived**, belongs to it, so an
  archived item never points at a missing category.
- The Inventory page has an **Active / Deactivated** switch. The Deactivated view lists archived items
  (`GET /inventory/archived`) with a Reactivate button, and has its own search.

**Decided:** any signed-in user (admin or storekeeper) may create, edit, archive and restore items.

**Archive reason and history (decided, decision 22; planned in the frontend).**

- Archiving **requires a reason**: `PATCH /inventory/:id/archive` with `{ "reason": "..." }`,
  1–500 characters, not only spaces (`422`, field `reason`). The Deactivate dialog gets a
  required text box.
- Every archiving creates a **new history record**; restoring completes that record. Nothing in
  the history is changed or deleted afterwards:
  ```json
  { "id": 4, "itemId": 7, "reason": "Discontinued by the supplier",
    "archivedBy": 2, "archivedAt": "2026-11-03T09:12:00.000Z",
    "restoredBy": 1, "restoredAt": "2026-11-09T10:40:00.000Z" }
  ```
  `restoredBy` / `restoredAt` stay `null` while the item is archived.
- `items.archivedAt` is kept as the item's current state, and it is written in the same database
  transaction as the history record, so the two always agree.
- The Deactivated list shows the reason, who archived the item and when (`archiveReason`,
  `archivedBy`, `archivedAt` on the item).
- `GET /inventory/:id/archive-history` returns the records, newest first, for active and
  archived items. A History button (shown when `archiveHistoryCount > 0`) opens them in a modal,
  like the transaction edit history.
- Restoring still clears `archived` / `archivedAt` and keeps the `409` on a name clash. It needs no
  reason.
- Barcodes of an archived item cannot be added or removed (`409`), like the item's other fields.

Until the backend exists this lives in `archiveInventoryItemApi` / `restoreInventoryItemApi` in
`src/services/inventoryApi.js` and `selectInventory` / `selectArchivedInventory` in
`src/services/mock/mockSelectors.js`.

### Cancelled transactions

A transaction is never deleted. Cancelling it sets `status` to `"cancelled"` and records
`cancelledAt` and `cancelledBy`; the record stays in the transaction lists so users can see that
it existed. **From then on it must be excluded from every calculation**, as if it had never been
recorded:

| Derived value | Effect of a cancelled transaction |
|---|---|
| Batch and item `quantity` | Not counted. A cancelled outgoing puts its quantity back in the batch; a cancelled incoming removes its batch from stock |
| `avgUnitCost` | Recalculated by replaying the item's **active** transactions in `createdAt` order with the formula above. Cancelling an early transaction therefore also changes the effect of every later receipt |
| Dashboard summary, stock movement, recent transactions | Not counted / not listed |
| Notifications | Follow the new stock levels (alerts appear or disappear) |
| Reports (all types, including incoming and outgoing value) | Not counted / not listed |
| User `transactionsCount` | Not counted |

Rules:

- A transaction can be cancelled once. Cancelling again returns `409`. A cancelled transaction
  cannot be edited (`409`) and cannot be restored, not even through an edit: to correct it, a
  new transaction is recorded.
- **An incoming transaction cannot be cancelled while stock issued from its batch is still
  active** (`409`): the batch would end up with a negative quantity. The outgoing transactions
  from that batch must be cancelled first.
- Cancelling **never rewrites other transactions**. The `unitCost` stored on other outgoing
  transactions keeps its historical value, even though the item's Average Cost is recalculated.
  New outgoing transactions take their snapshot from the recalculated Average Cost.
- The batch record of a cancelled incoming transaction is kept, so its `batchId` still resolves
  to a batch number in `GET /inventory/batches/lookup`. Its batch number may be reused: the
  "unique per item and manufacturer" rule applies only to batches whose incoming transaction is
  active.

Example (continuing the Average Cost table above): after "Receive 15 at $9" the stock is 40 at
$7.75. If "Issue 5" is then cancelled, the stock becomes 45 and the Average Cost is replayed as
(30×7 + 15×9) ÷ 45 = **$7.67**. An outgoing transaction saved earlier at $7.75 still returns
`unitCost: 7.75`.

Until the backend exists, the frontend simulates this in `isActiveTransaction` /
`selectActiveTransactions` in `src/services/mock/mockSelectors.js` and `cancelMock` in
`src/services/transactionsApi.js`.

### Editing transactions

`PUT /transactions/:id` replaces every editable field of an active transaction in one request.
The backend must run it as **one database transaction**: either every rule below passes and all
records are saved, or nothing is saved at all.

Editable fields:

| Field | Incoming | Outgoing | Notes |
|---|---|---|---|
| `type` | yes | yes | A transaction can be changed from incoming to outgoing and back |
| `itemId` | yes | yes | Must be an active (not archived) item. A transaction of an archived item cannot be edited at all (`409`) |
| `quantity` | yes | yes | A whole number greater than 0 |
| `date` | yes | yes | A real date, `YYYY-MM-DD`, not in the future |
| `batchNumber` | yes | no | Renames the batch this transaction received. Unique per item **and manufacturer** among active batches |
| `unitCost` | yes | no | Zero or more. Also stored on the batch |
| `expiryDate` | yes | no | A real date or `null`, not before `date`. Also stored on the batch |
| `supplier` | yes | no | **Optional**. Also stored on the batch |
| `manufacturer` | yes | no | Optional manufacturer name; an unknown name creates the manufacturer. Also stored on the batch |
| `manufacturingDate` | yes | no | A real date or `null`; not in the future, not after `date`, not after `expiryDate`. Also stored on the batch |
| `batchId` | no | yes | Which batch the stock is issued from |
| `recipient` | no | yes | Required |

Never editable, and ignored if sent: `id`, `createdAt`, `recordedBy`, `status`, `cancelledAt`,
`cancelledBy`, and the `unitCost` of an outgoing transaction. A cancelled transaction cannot be
edited or reactivated (`409`).

**Nothing derived is stored by the edit.** Stock, batch quantities and Average Cost are
calculated from the active transactions, so once the transaction and its batch record are saved,
inventory, dashboard, notifications and reports all follow. In particular the Average Cost is
replayed over the item's active transactions in `createdAt` order (which an edit never changes),
so editing an old receipt changes the effect of every later receipt.

**Unit Cost of outgoing transactions:**

- The `unitCost` stored on *other* outgoing transactions is never rewritten by an edit, even
  when the Average Cost changes. Example: receive 10 at $5 and 20 at $8, issue 5 (saved at $7).
  Editing the first receipt to $6 makes the Average Cost $7.33, but that outgoing transaction
  still returns `unitCost: 7`.
- The edited outgoing transaction keeps its own stored `unitCost` when only its quantity, batch,
  date or recipient change.
- It is set again, from the item's current Average Cost, only when the old value no longer
  applies: the item was changed, or the transaction used to be incoming.

Rules that reject an edit (the response body carries a message the UI shows as is):

| Situation | Status |
|---|---|
| The transaction belongs to an archived item | `409` |
| Unknown type, unknown or archived item, missing or invalid quantity / date / unit cost / expiry date / batch number / supplier / recipient | `422` |
| `date` is in the future | `422` |
| Incoming: `expiryDate` is before `date` (the batch was already expired when received). Checked only when `date` or `expiryDate` changes, or when the transaction used to be outgoing, so an old receipt whose batch has expired since can still be corrected | `422` |
| Incoming: the item already has an active batch with that number **from the same manufacturer** (or, with no manufacturer, another active batch with no manufacturer and that number) | `409` |
| Incoming: `manufacturingDate` in the future, after `date` or after `expiryDate` (planned) | `422` |
| Incoming whose batch has active outgoing transactions: item changed, quantity below what was issued, or changed to outgoing | `409` |
| Incoming: `date` later than the first date stock was issued from its batch | `422` |
| Outgoing: `batchId` is not a batch of that item with an active receipt | `422` |
| Outgoing: quantity above what the batch has available to it (its own previous quantity counts as available) | `422` |
| Outgoing: the batch was recorded as received after this transaction was recorded (`createdAt`) | `422` |
| Outgoing: `date` earlier than the date the batch was received | `422` |
| Anything else that would leave a batch negative at any point of its history | `409` |

Batch handling:

- Incoming stays incoming: the same batch record is updated (`itemId`, `batchNumber`, `unitCost`,
  `supplier`, `expiryDate`, and, when planned, `manufacturerId`, `manufacturingDate`). Its id does not change, so outgoing transactions keep pointing at it.
- Outgoing to incoming: a new batch is created; the quantity it had issued returns to the old batch.
- Incoming to outgoing: the batch it received no longer has a receipt and leaves stock. The
  record is kept so its number still resolves in `GET /inventory/batches/lookup`.

The same date rule now also applies when recording: `POST /transactions/outgoing` returns `422`
if `date` is earlier than the date its batch was received.

Until the backend exists, the frontend simulates all of this in `updateMock` in
`src/services/transactionsApi.js`, run through `transact` in `src/services/mock/mockDb.js`
(works on a copy and only keeps it if nothing failed), with `isStockConsistent` in
`src/services/mock/mockSelectors.js` as the final check.

### Edit history

**Decided** (backend), **planned** (frontend). Every successful edit is recorded, so an edited
transaction never loses what it said before. The record is saved **in the same database
transaction as the edit**: either both are saved or neither is.

```json
{ "id": 7, "transactionId": 18, "editedBy": 1, "editedAt": "2026-10-04T08:15:00.000Z",
  "oldValues": { "quantity": 100, "unitCost": 5 },
  "newValues": { "quantity": 80, "unitCost": 4.5 } }
```

- `oldValues` / `newValues` hold **only the fields that changed**, with the request field names
  (`type`, `itemId`, `quantity`, `date`, `batchNumber`, `unitCost`, `expiryDate`, `supplier`,
  `batchId`, `recipient`; **planned:** `manufacturerId`, `manufacturingDate`) and raw values (ids,
  ISO dates, numbers). The manufacturer is recorded as `manufacturerId`, although the request
  sends it by name. The frontend turns ids into names with the lookup endpoints
  (`GET /manufacturers` for manufacturers); items, batches, users and manufacturers are never
  deleted, so every id resolves.
- The transaction, the batch, the stock recalculation, a manufacturer created by the edit and
  the revision record are all saved in **one database transaction**.
- A change the server makes as a result of the edit is recorded too: the new `unitCost` snapshot
  of an outgoing transaction whose item changed, or that used to be incoming.
- An edit that changes nothing creates no record.
- Cancelling is not an edit: it is recorded by `cancelledAt` / `cancelledBy` on the transaction.
- `GET /transactions/:id/revisions` (section 4.5) returns the records, newest first.
- **Planned (frontend):** a History button beside the row's actions, shown only when
  `revisionsCount > 0`, opens a modal listing every edit with who, when, and old → new values.
  The mock records edits the same way so the button works in mock mode too.

### Stock and expiry rules

These rules live in `src/utils/stock.js` and must match on the backend, because it computes the
dashboard counts, alerts and reports:

| Status | Rule |
|---|---|
| `out_of_stock` | `quantity <= 0` |
| `low_stock` | `0 < quantity <= minQty` |
| `available` | `quantity > minQty` |
| `expired` | batch `expiryDate` is before today |
| `expiring_soon` | batch `expiryDate` is today or within the next 30 days (inclusive). Never used for a batch that is already expired |

- A batch whose `expiryDate` is `null` (supplies that do not expire) is never `expired` or
  `expiring_soon` and raises no expiry alert.
- Only batches with stock count: a used-up batch never makes an item "expiring".
- **Alerts and never-stocked items.** A stock alert (notification, critical-inventory row) is
  raised for an item that is `low_stock` or `out_of_stock` **and has at least one active incoming
  transaction**. A newly created item that has never received stock still shows the status
  "Out of Stock" in the inventory list and is counted as out of stock in the dashboard and the
  Inventory Summary report, but it does not raise an alert: nothing has run out.
- **Expired stock** is not available stock and cannot be issued. See the next section.

### Batch expiry and disposal

**Expiry belongs to a batch, never to an item.** An item is never "expired"; it stays active and
available through its valid batches while one of its batches is expired.

Quantities (**backend must** calculate them; the mock does it in `selectBatchQuantities` and
`selectItem` in `src/services/mock/mockSelectors.js`, the one place the split is made):

| Value | On | Meaning |
|---|---|---|
| `quantity` | batch | What is physically left in the batch: received − issued − disposed |
| `expiryStatus` | batch | `expired`, `expiring_soon` or `null`, from the batch's `expiryDate` and today's date. Nobody sets it by hand, and nothing is rewritten when a batch expires |
| `availableQuantity` | batch | `quantity` if the batch has not expired, otherwise `0` |
| `expiredQuantity` | batch | `quantity` if the batch has expired, otherwise `0`: expired stock still on the shelf |
| `quantity` | item | **Available stock**: the sum of `availableQuantity`. Stock status, low / out-of-stock alerts, the dashboard and the reports all use this figure |
| `expiredQuantity` | item | Expired stock awaiting disposal: the sum of the batches' `expiredQuantity` |
| `disposedQuantity` | item | The total quantity of the item's active disposal transactions |

An expired batch keeps its record, quantity, purchase price, supplier and expiry date until its
stock is disposed of. An item whose only stock has expired is `out_of_stock` (nothing is usable)
and still shows its expired quantity.

**Issuing.** An outgoing transaction (`POST /transactions/outgoing`, or an edit) can never take
stock from an expired batch: `422`, field `batchId`. The limit for an issue is the selected
batch's `availableQuantity`, never the item's total. The form lists an expired batch greyed out
with the reason; the service rejects it regardless of what the page sends. One exception keeps
history correctable: an issue that was recorded before its batch expired can still be edited
(recipient, date, a lower quantity), but an edit cannot raise its quantity or move it onto an
expired batch.

**Disposal.** `POST /transactions/disposal` records that expired stock was removed.

- **Implemented (UI):** a disposal is started in one place only: the Inventory page, where each
  expired batch in an item's batch details has its own Dispose button. After a confirmation it
  sends the batch's whole remaining quantity with today's date. The Transactions page lists
  disposals as history (and can cancel one) but cannot start one. The endpoint itself still
  accepts any valid quantity and date.

- It is stored as an **outgoing transaction with `reason: "expired_disposal"`** and no recipient,
  so it uses the same batch arithmetic as an issue and can never be mistaken for consumption.
  Ordinary outgoing transactions have `reason: "issue"`.
- The batch must be expired (`422`, `batchId`); `quantity` must be above 0 and not more than the
  batch's `expiredQuantity` (`422`, `quantity`); `date` must be after the batch's expiry date and
  not before the batch was received (`422`, `date`).
- It lowers the batch's `quantity` and `expiredQuantity` and the item's `expiredQuantity`, and
  raises `disposedQuantity`. Available stock is untouched. Because the quantity leaves the batch,
  the same stock cannot be disposed of twice: once the batch is empty there is nothing to dispose.
- A disposal cannot be edited (`409`): to correct it, cancel it and record it again. Cancelling
  it (`PATCH /transactions/:id/cancel`) returns the quantity to the batch as expired stock.
- The original incoming transaction and the batch record are never changed by a disposal.
- An item cannot be deactivated while it has expired stock awaiting disposal (`409`).
- **Access:** any signed-in user, like the other transaction endpoints (decision 5).

**Valuation.** The costing model is unchanged: one moving Average Cost per item.

- Available value (`stockValue`) = available quantity × `avgUnitCost`.
- Expired value (`expiredValue`) = expired quantity × `avgUnitCost`, reported beside the available
  value and never inside it.
- A disposal's value = its quantity × the Average Cost stored on it, like any outgoing
  transaction. When stock is disposed of, its value moves from `expiredValue` to `disposedValue`,
  once.
- A batch keeps the purchase price it was received at (`unitCost`), and expiry or disposal never
  changes the Average Cost or any earlier transaction.
- Example: batch B001, 10 at $5, expired; batch B002, 20 at $7, valid. Average Cost $6.3333.
  Total $190.00 = available $126.67 + expired $63.33. **The expired amount is 10 × $6.33, not the
  batch's own 10 × $5 = $50**, because the application values stock at the item's Average Cost,
  not per batch. Valuing each batch at its own price would be a different costing model
  (decision 16 keeps the Average Cost model).
- **Not implemented:** an accounting write-off or loss entry. The disposal is recorded with its
  quantity and value; what the accounts do with it is outside this application.

**Dates.** A batch is expired when its expiry date is before today's local date. It is judged by
today, not by a transaction's date: stock from a batch that has expired since cannot be issued
with a back-dated transaction.

## 4. Endpoints

### 4.1 Authentication

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/auth/login` | Public | |
| GET | `/auth/me` | Any signed-in user | The user the token belongs to: `{ "id", "name", "email", "role" }`. `401` if the token is no longer valid |
| POST | `/auth/logout` | Any signed-in user | No body. Lets the server revoke the token. The frontend ignores the result |

`POST /auth/login` request: `{ "email": "<email>", "password": "<password>", "remember": false }`

`remember` (**planned** in the frontend: today it sends only `email` and `password`) is the
"Remember me" checkbox. It sets the token lifetime: 30 days when `true`, 24 hours when `false`
or missing.

Response `200`:
```json
{ "token": "<sanctum token>", "user": { "id": 1, "name": "Sara Ahmed", "email": "sara@medcenter.ps", "role": "admin" } }
```
Errors: `401` wrong email or password; `403` account is inactive; **planned:** `403` account
has expired ("This account expired on 2026-11-14. Please contact an administrator.").
Inactive and expired users must not be able to log in.

**Backend must:** store passwords hashed, sign and expire tokens, rate-limit login, and return the
same `401` message for an unknown email and a wrong password.

**Mock only:** the mock compares plain-text demo passwords and issues `mock-token-<userId>`. It
is a development stand-in and is not authentication.

**Password reset.** There is no self-service "forgot password": no email is sent and no reset
endpoint is called. The login page's "Forgot Password?" link says so and tells the user to ask
an administrator, who sets a new password with `PUT /users/:id/password` (section 4.2). If a
reset-by-email flow is wanted later, it needs two new public endpoints (for example
`POST /auth/forgot-password` `{ email }` and `POST /auth/reset-password` `{ token, newPassword }`)
and a new page; neither exists today.

### 4.2 Users

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/users?search=` | Admin | Returns `User[]`. `search` matches name, email, role, status |
| GET | `/users/directory` | Any signed-in user | Returns `[{ "id", "name" }]` for **all** users. Used to show who recorded a transaction |
| POST | `/users` | Admin | Creates a storekeeper |
| PUT | `/users/:id` | Admin | Updates name, email, status |
| PUT | `/users/:id/password` | Admin | Sets a new password for that user. Request `{ "newPassword" }`. No response body needed |

`POST /users` request: `{ "name", "email", "password", "role": "storekeeper" }` → `201` with the `User`.
New users start `active`. `409` if the email is taken.

`PUT /users/:id` request: `{ "name", "email", "status" }` → `200` with the `User`. `404` / `409` as applicable.

**Planned:** both requests also accept `"accountExpiresOn": "2026-12-31"` or `null` (see "Account
expiry" below). `search` on `GET /users` also matches "expired".

Validation (**backend must**; the mock applies the same rules):

| Rule | Status | Field |
|---|---|---|
| `name` is required (not only spaces) | `422` | `name` |
| `email` is a valid address | `422` | `email` |
| `email` is not used by another account (case-insensitive) | `409` | `email` |
| `password` / `newPassword` has at least 6 characters (`MIN_PASSWORD_LENGTH`) | `422` | `password` / `newPassword` |
| `status` is `active` or `inactive` | `422` | `status` |
| An admin cannot deactivate the account they are signed in with | `409` | `status` |

**Decided:** there is exactly one admin, created by the database seeder. `POST /users` only creates
storekeepers (any other `role` is rejected with `422`), roles never change, and users are never
deleted: an account that should no longer be used is set to `inactive`. Because the one admin
cannot deactivate their own account, the system always keeps an active admin.
`lastActiveAt` is updated at login (open decision 15).

#### Account expiry (decided, decision 23; planned in the frontend)

An **account** expires, not a password. There is no password expiry.

- Only **storekeeper** accounts can expire. The admin sets the date for each storekeeper with
  `accountExpiresOn` in `POST /users` and `PUT /users/:id` (optional; `null` = never expires). The
  admin account never expires: a date sent for it is rejected (`422`, field `accountExpiresOn`).
- **Decided:** `accountExpiresOn` is the **last day** the account works; it stops the next day.
- Validation: `null` or a real `YYYY-MM-DD` date, not before today (`422`). **Decided:** a past
  date is refused; to stop an account at once, the admin sets it `inactive`.
- From the day after `accountExpiresOn`, login returns `403` and every request with an existing
  token returns `401`, so the user is signed out. The tokens are not deleted: moving the date
  forward makes the account usable again (a new sign-in is needed if the token itself expired).
- Alerts (section 4.6): `account_expiring` while 1–7 days are left, and `account_expires_today`
  on the last day. Both go to the admin and to the storekeeper whose account it is. An inactive
  account raises none. **Decided:** no alert after the account has expired; the Users page shows
  the "Expired" badge instead.
- Changing the date or the status updates the alerts at once (they appear, disappear, or become a
  new unread alert).
- There is no "request an extension" flow: the storekeeper asks the admin, who edits the date.

User form fields (planned): `name` *, `email` *, `password` * (create only), `status` *,
`accountExpiresOn` (optional, storekeepers only).

### 4.3 Categories

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/categories` | Any signed-in user | Returns `Category[]` |
| POST | `/categories` | Admin | Request `{ "name" }` → the `Category`. `409` on duplicate name |
| PUT | `/categories/:id` | Admin | Request `{ "name" }` → the `Category`. `409` on duplicate name |
| DELETE | `/categories/:id` | Admin | `409` while any item, **active or archived**, still uses the category. `404` if it does not exist |

A category name is required (`422`, field `name`) and unique, case-insensitive (`409`).

### 4.4 Inventory

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/inventory?search=` | Any signed-in user | Returns `Item[]`, **active items only**. `search` matches name, category name, unit, batch number |
| GET | `/inventory/archived?search=` | Any signed-in user | Returns `Item[]`, **archived items only**, most recently archived first. Same search fields |
| GET | `/inventory/batches/lookup` | Any signed-in user | Returns `[{ "id", "itemId", "batchNumber" }]` for **every** batch ever received, including used-up ones. Used to show the batch number for a `batchId` |
| GET | `/inventory/lookup` | Any signed-in user | Returns `[{ "id", "name", "unit", "archived" }]` for **all** items, including archived ones, so old transactions can still show the item name |
| POST | `/inventory` | Any signed-in user | Creates an item |
| PUT | `/inventory/:id` | Any signed-in user | Updates `name`, `categoryId`, `unit`, `minQty` only. Stock, batches, costs and the archive state are never changed by it. `409` if the item is archived |
| PATCH | `/inventory/:id/archive` | Any signed-in user | Archives the item (this is what "Delete" does). No body today; **planned:** `{ "reason" }`, required. Returns the `Item`. `409` while it has stock or if it is already archived |
| PATCH | `/inventory/:id/restore` | Any signed-in user | Restores an archived item. No body. Returns the `Item`. `409` if it is not archived or an active item has the same name |
| GET | `/manufacturers?search=` | Any signed-in user | `[{ "id", "name" }]`, alphabetical. Without `search`: every manufacturer (a lookup, like `/inventory/lookup`). With it: names containing the text, case and surrounding spaces ignored, for the autocomplete. `422` (field `search`) if `search` is not text or is longer than 150 characters |

**Planned** endpoints (decisions 19–22):

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/inventory/by-barcode/:code` | Any signed-in user | `{ "item": { "id", "name", "unit", "archived" }, "manufacturerId", "barcode" }`. `404` if no item has that barcode. An archived item is returned with `archived: true`, so the UI can say it is deactivated |
| POST | `/inventory/:id/barcodes` | Any signed-in user | Request `{ "barcode", "manufacturer" }` (manufacturer name, required; created if new) → `201` with the `Item`. `409` if the barcode is already used by any item (field `barcode`) or the item is archived |
| DELETE | `/inventory/:id/barcodes/:barcodeId` | Any signed-in user | → `200` with the `Item`. `404` if the barcode is not this item's; `409` if the item is archived |
| GET | `/inventory/:id/archive-history` | Any signed-in user | Archive records, newest first (shape in "Archived items", section 3). `[]` if never archived |

Changes to existing endpoints (planned):

- `PATCH /inventory/:id/archive` takes `{ "reason" }` (required, see "Archived items").
- `search` on `/inventory` and `/inventory/archived` also matches barcodes, manufacturer names and
  `activeIngredient`.
- `/inventory/batches/lookup` rows also carry `manufacturerId`.

There is no `DELETE /inventory/:id`: items are never removed. All rules are in "Archived items"
in section 3.

`POST` / `PUT` request: `{ "name": "Bandage Roll", "categoryId": 2, "unit": "pack", "minQty": 0 }` → the full `Item`.
A new item has `quantity` 0 until an incoming transaction is recorded.
**Planned:** the request also carries the six optional detail fields (`activeIngredient`,
`strength`, `dosageForm`, `storageConditions`, `uses`, `description`; `null` or empty = not
set). Barcodes are not part of it: they are managed with the barcode endpoints above, because the
Incoming form links a barcode on its own.

Item form: `name` *, `categoryId` *, `unit` *, `minQty` *; the six detail fields and the barcode
list are optional.

| Rule | Status | Field |
|---|---|---|
| `name` is required (not only spaces) | `422` | `name` |
| `name` is not used by another **active** item (case-insensitive) | `409` | `name` |
| `categoryId` is an existing category | `422` | `categoryId` |
| `unit` is one of the units in section 2 | `422` | `unit` |
| `minQty` is a whole number, zero or more | `422` | `minQty` |
| Planned: each detail field is text within its length limit (section 3, "Inventory item") | `422` | that field |
| Planned: `barcode` is 1–64 characters with no spaces | `422` | `barcode` |
| Planned: `barcode` is not used by any item, active or archived | `409` | `barcode` |
| Planned: `manufacturer` (barcode link) is required | `422` | `manufacturer` |

**Planned, frontend:** clicking an item opens an **Item Details** modal that replaces today's
batch modal: the item's details and barcodes at the top, then the batch list as today (batch
number, manufacturer, manufacturing date, expiry date, supplier, quantity, status, Dispose
button). It needs no new endpoint: everything is on the `Item`.

### 4.5 Transactions

| Method | Endpoint | Access |
|---|---|---|
| GET | `/transactions/incoming?search=&itemId=&from=&to=` | Any signed-in user |
| POST | `/transactions/incoming` | Any signed-in user |
| GET | `/transactions/outgoing?search=&itemId=&from=&to=` | Any signed-in user |
| POST | `/transactions/outgoing` | Any signed-in user |
| PUT | `/transactions/:id` | Any signed-in user |
| GET | `/transactions/:id/batch-options?itemId=` | Any signed-in user |
| GET | `/transactions/:id/revisions` | Any signed-in user |
| POST | `/transactions/disposal` | Any signed-in user |
| PATCH | `/transactions/:id/cancel` | Any signed-in user |

`GET` returns `Transaction[]` of that type, newest first (`createdAt` descending), **including
cancelled transactions** (the page shows them with a Cancelled badge).
`from` / `to` are inclusive ISO dates applied to `date`. `search` matches item name, batch number,
supplier, recipient and the recorder's name (**planned:** and the manufacturer name). All query
parameters are optional.

`POST /transactions/incoming` request:
```json
{ "itemId": 4, "batchNumber": "SS-402", "quantity": 100, "unitCost": 4.5, "date": "2026-10-08",
  "expiryDate": "2027-03-01", "supplier": "BioLab", "manufacturer": "BioLab Pharma", "manufacturingDate": "2026-08-15" }
```
**Implemented** (backend, mock and form): `GET` and `POST /transactions/incoming`.
`expiryDate`, `supplier`, `manufacturer` and `manufacturingDate` are optional (`null`).
- `manufacturer` is a **name**. It is matched to an existing manufacturer in any spelling
  (`ManufacturerService::resolve()`); a name that matches none creates it, in the same database
  transaction as the receipt, so a rejected receipt leaves no new manufacturer behind. The
  response carries `manufacturerId`.
- Every incoming transaction **creates a new batch** with a new unique id. The response carries
  that id as `batchId`.
- `batchNumber` is the label printed by the manufacturer. `409` if the item already has an active
  batch with that number from the same manufacturer (a batch whose incoming transaction was
  cancelled does not count).
- `date` and `expiryDate` must be real dates (`422` otherwise).
- `expiryDate` may be `null`.

Incoming form (**implemented** markers): `itemId` *, `quantity` *, `unitCost` *, `date` *,
`batchNumber` *; optional: `manufacturer`, `manufacturingDate`, `expiryDate`, `supplier`.
Outgoing form: `itemId` *, `batchId` *, `quantity` *, `date` *, `recipient` * (no optional field).
- The item's Average Cost is updated as described in section 3.

`POST /transactions/outgoing` request:
```json
{ "itemId": 4, "batchId": 10, "quantity": 15, "date": "2026-10-08", "recipient": "Surgery Ward" }
```
- The batch is identified by `batchId`.
- Must fail with `422` if the batch does not belong to that item or holds less than `quantity`,
  or if `date` is earlier than the date the batch was received.
- The request has no `unitCost`: the backend reads the item's current `avgUnitCost`, stores it
  as the transaction's `unitCost`, and returns it in the response.
- The item's Average Cost does not change.

Both return `201` with the saved `Transaction`.

No request carries `recordedBy`: **the backend must take the recorder from the token** (the mock
does the same from its mock token).

Validation on create (**backend must**; the mock applies exactly the same rules on create and on
edit, and validates everything before it stores anything, so a rejected request leaves no batch
and no stock change behind):

| Rule | Status | Field |
|---|---|---|
| `itemId` is an existing, active (not archived) item | `422` | `itemId` |
| `quantity` is a whole number greater than 0 | `422` | `quantity` |
| `date` is present and a real `YYYY-MM-DD` date | `422` | `date` |
| `date` is not in the future (also for disposals) | `422` | `date` |
| Incoming: `unitCost` is a number, zero or more (missing is rejected, not read as 0) | `422` | `unitCost` |
| Incoming: `batchNumber` is required | `422` | `batchNumber` |
| Incoming: the item has no active batch with that number from the same manufacturer (no manufacturer = its own group) | `409` | `batchNumber` |
| Incoming: `expiryDate` is `null` or a real date | `422` | `expiryDate` |
| Incoming: `expiryDate` is not before `date`: stock that was already expired when it arrived cannot be received. A back-dated receipt of a batch that has expired since is accepted and counts as expired stock at once | `422` | `expiryDate` |
| Incoming: `supplier` is optional, at most 150 characters | `422` | `supplier` |
| Incoming: `manufacturer` is optional, at most 150 characters, and has at least one letter or digit | `422` | `manufacturer` |
| Incoming: `manufacturingDate` is `null` or a real date, not in the future, not after `date` and not after `expiryDate` | `422` | `manufacturingDate` |
| Outgoing: `batchId` is a batch of that item with stock | `422` | `batchId` |
| Outgoing: `quantity` is not more than the batch holds | `422` | `quantity` |
| Outgoing: `date` is not before the date the batch was received | `422` | `date` |
| Outgoing: `recipient` is required | `422` | `recipient` |

**Decided:** quantities are whole numbers, a transaction cannot be dated in the future, and a
batch that was already expired on its receipt date cannot be received. The mock does not
enforce these three rules (it accepts any number above 0 and any date); the backend does.

`POST /transactions/disposal` request (expired stock only; rules in "Batch expiry and disposal"):
```json
{ "itemId": 4, "batchId": 10, "quantity": 15, "date": "2026-11-02" }
```
Returns `201` with the saved `Transaction`: `type: "outgoing"`, `reason: "expired_disposal"`,
`recipient: null`, and `unitCost` set from the item's Average Cost. It is listed by
`GET /transactions/outgoing`, where `search` also matches "expired stock disposal".

`PUT /transactions/:id` edits a transaction. The request carries the full set of fields for the
type being saved:
```json
{ "type": "incoming", "itemId": 4, "quantity": 140, "date": "2026-10-03",
  "batchNumber": "SS-401A", "unitCost": 5, "expiryDate": "2027-12-31", "supplier": "BioLab" }
```
(plus `manufacturer` and `manufacturingDate`, as on create: **implemented** in the edit form and the
mock; the backend endpoint itself is built in phase 4)
```json
{ "type": "outgoing", "itemId": 4, "quantity": 10, "date": "2026-10-05",
  "batchId": 10, "recipient": "Surgery Ward" }
```
Response `200` with the saved `Transaction`. `404` if not found. All rules, the effect on stock
and costs, and the rejection statuses are in "Editing transactions" in section 3.

`GET /transactions/:id/batch-options?itemId=` returns the batches that transaction could issue
from as an outgoing transaction of `itemId`:
`[{ "id": 10, "batchNumber": "SS-401", "quantity": 135, "expiryDate": "2026-10-28", "expiryStatus": "expiring_soon" }]`.
`quantity` is what is available **to this transaction**: its own current quantity counts as
available again, the batch it received itself is left out, and so are batches received after it
was recorded. The edit form uses it for the batch list, so the UI never calculates stock.
**Planned:** each row also carries `manufacturerId`. An optional `&manufacturerId=` puts that
manufacturer's batches first, nearest expiry first, then the others. The Outgoing create form
gets the same list from a new `GET /inventory/:id/batch-options?manufacturerId=` (available
batches of the item, same row shape, same order), so neither form sorts batches itself.

`GET /transactions/:id/revisions` returns the transaction's edit history, newest first (the
record shape and rules are in "Edit history" in section 3). `[]` for a transaction that was never
edited; `404` if the transaction does not exist.

`PATCH /transactions/:id/cancel` has no request body. Response `200` with the `Transaction`
(`status: "cancelled"`, `cancelledAt`, and `cancelledBy` taken from the token). `404` if not
found; `409` if it is already cancelled, if it belongs to an archived item, or if it is an
incoming transaction whose batch has active outgoing transactions. All rules are in "Cancelled
transactions" in section 3.

**Decided:** any signed-in user (admin or storekeeper) may record, edit and cancel any
transaction, including one recorded by someone else, and record disposals. Who recorded,
edited and cancelled it is always kept (`recordedBy`, the edit history, `cancelledBy`).

### 4.6 Notifications

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/notifications?search=` | Any signed-in user | Returns `Notification[]`, newest first today; **planned:** in priority order (below). The frontend filters by type and counts per tab itself |
| GET | `/notifications/unread-count` | Any signed-in user | Returns `{ "count": 3 }`. Drives the red dot on the bell |
| PATCH | `/notifications/:id/read` | Any signed-in user | Returns the updated `Notification` |
| PATCH | `/notifications/read-all` | Any signed-in user | No body needed in the response |

`search` matches the item name, the type (as words, e.g. "low stock") and the batch number.
`PATCH /notifications/:id/read` returns `404` for an alert that no longer exists.

Notifications reflect the current state of the **active** inventory (see the rules in section 3).
When a problem is resolved, for example after restocking, its notification should disappear.

Which alerts exist (**backend must** generate these; the mock derives them on every read):

| Alert | One per | Raised while |
|---|---|---|
| `low_stock` | item | The item is `low_stock` |
| `out_of_stock` | item | The item is `out_of_stock` **and has received stock before** (a new, never-stocked item raises none) |
| `expiring` | batch | A batch with stock is `expired` (raised until its stock is disposed of) or `expiring_soon`; `expiryStatus` says which, and a batch is never both |

| `account_expiring` (**planned**) | storekeeper account | 1–7 days are left before `accountExpiresOn` and the account is active |
| `account_expires_today` (**planned**) | storekeeper account | Today is `accountExpiresOn` and the account is active |

- An item has at most one stock alert, and each batch at most one expiry alert, so the same
  condition is never reported twice. Archived items raise none.
- There are no notifications for individual transactions or sign-ins. **Planned:** the two
  account alerts above are the only alerts about users.
- **Who sees which alert (planned).** Stock and expiry alerts: every signed-in user, as today.
  Account alerts: the admin, and the storekeeper whose account it is; other storekeepers never see
  them. `unread-count`, `/dashboard/alerts` and search follow the same rule. `search` also matches
  the account holder's name and "account".
- The 7-day alert and the last-day alert are two separate alerts, so the last-day one arrives
  unread even if the first was read.

**Priority order (decided, decision 24; planned).** All alert types are kept, Low Stock
included; only the order changes. `GET /notifications` and `/dashboard/alerts` return:

| Rank | Alert | Within the rank |
|---|---|---|
| 1 | Expired batch (`expiring` with `expiryStatus: "expired"`) | Oldest expiry date first |
| 2 | `out_of_stock` | Newest first |
| 3 | Expiring soon (`expiring` with `expiryStatus: "expiring_soon"`) | Nearest expiry date first |
| 4 | `low_stock` | Newest first |
| 5 | `account_expires_today`, then `account_expiring` | Fewest days left first |

**Decided:** account alerts come last, after every stock alert, and
`/dashboard/critical-inventory` uses the same ranks 1–4. The Notifications page keeps its tabs; **planned:** an "Accounts" tab for the two
new types. The mock must return the same order.
- **Mock only:** an alert's `id` is `<type>-<itemId or batchId>` and its `createdAt` is when the
  mock first saw the condition. **Open decision:** whether the backend stores alerts or derives
  them, what `createdAt` means, and whether an alert that comes back after being resolved is
  unread again (in the mock it is).
- The bell's red dot uses `GET /notifications/unread-count`. It is refreshed on every page
  change and after any action that can change stock; there is no polling or push.

### 4.7 Dashboard

| Method | Endpoint | Access | Response |
|---|---|---|---|
| GET | `/dashboard/summary` | Any signed-in user | `{ "totalItems": 6, "availableCount": 3, "lowStockCount": 2, "outOfStockCount": 1, "expiringSoonCount": 2, "expiredCount": 0 }` |
| GET | `/dashboard/stock-movement?months=6` | Admin | `[{ "month": "2026-05", "incoming": 180, "outgoing": 70, "disposed": 0 }]`, oldest month first, one entry per month even when zero |
| GET | `/dashboard/critical-inventory?search=` | Storekeeper | `[{ "id": "low_stock-2", "itemId": 2, "categoryId": 1, "quantity": 15, "status": "low_stock" }]` |
| GET | `/dashboard/alerts?search=&limit=3` | Any signed-in user | `Notification[]`, most severe first. Today: out of stock, low stock, expired, then expiring soon; equal ranks newest first. **Planned:** the priority order of section 4.6 (expired, out of stock, expiring soon, low stock, accounts). Both dashboards show the first 5 |
| GET | `/dashboard/recent-transactions?search=&limit=5` | Any signed-in user | Active `Transaction[]` of both types, newest first |

- Every summary value is a **number of active items**, so nothing adds boxes to bottles.
  `availableCount`, `lowStockCount` and `outOfStockCount` count items by stock status and add up
  to `totalItems`.
- `expiringSoonCount` counts items with at least one batch that is expiring soon;
  `expiredCount` counts items with at least one batch that has already expired. An expired batch
  is never counted as expiring soon. One item can be in both.
- In stock movement, `outgoing` counts stock **issued** only; expired stock disposals are returned
  apart as `disposed` (as in the reports, a disposal is not consumption). The chart draws incoming
  and outgoing; `disposed` is named in its tooltips.
- `incoming` / `outgoing` in stock movement are total quantities for the calendar month (by
  transaction `date`), over the last `months` calendar months including the current one. The
  frontend scales the bars. **Known limitation:** the quantities of all items are added together
  whatever their unit, so the chart shows relative activity, not a stock figure. It includes the
  history of archived items.
- Each dashboard section is loaded by its own request. If one fails, the others are still shown
  and a banner names what could not be loaded.
- **Implemented:** the admin dashboard also reads two totals from the reports endpoint (section
  4.8), with no filters and `pageSize=1`: `stockValue` / `expiredValue` from
  `GET /reports/inventory_value` and `transactionsCount`, `incomingCount`, `outgoingCount`,
  `disposalCount` from `GET /reports/movement_history`. No new endpoint is needed.
- **Implemented:** both dashboards read their alert list from `/dashboard/alerts` (`limit=5`) and
  the badge count from `GET /notifications` with the same `search`, so admins and storekeepers see
  the same stock and expiry alerts (account alerts are per audience, section 4.6). `/dashboard/alerts` returns nothing a user could not already read on
  `/notifications`.
- **Implemented:** the Admin Dashboard banner buttons read the alert count from `GET /notifications`
  and the transaction count from `GET /reports/movement_history`.
- `search` on `critical-inventory` matches item name, category name and status (as words); on
  `alerts` it matches the same fields as notifications; on `recent-transactions` it matches item
  name, type, the recorder's name and batch number.
- `critical-inventory` has one row per problem: an item that is both low and expiring appears twice.
  `status` is `low_stock`, `out_of_stock`, `expiring_soon` or `expired`. `id` must be unique per row.

### 4.8 Reports

| Method | Endpoint | Access |
|---|---|---|
| GET | `/reports/:type?from=&to=&categoryId=&itemId=&search=&page=&pageSize=` | Any signed-in user |

**Decided:** all four reports, including `inventory_value`, are open to both roles (the frontend
page for storekeepers is **planned**, see section 2). Money values are not hidden from
storekeepers: they already see unit costs on the Inventory and Transactions pages.

`:type` is `summary`, `movement_history`, `critical_items` or `inventory_value`. An unknown type is `404`.
The frontend requests `pageSize=5` for the table and, today, `pageSize=1000` when exporting
(**planned:** exports use the export endpoint below instead).

What each filter applies to:

| Filter | `summary`, `critical_items` | `movement_history` | `inventory_value` |
|---|---|---|---|
| `from` / `to` (inclusive, on transaction `date`) | Ignored: these show the inventory as it is today | Applied | Applied to `incomingValue` / `outgoingValue` only; rows and `stockValue` are today's inventory |
| `categoryId`, `itemId` | Applied | Applied (through the transaction's item) | Applied to rows and to both value totals |
| `search` | Item name, category name | Item name, type, supplier, recipient, batch number | Item name, category name (rows and both value totals) |
| Archived items | Excluded | **Included** | Excluded from rows and `stockValue`; **included** in `incomingValue` / `outgoingValue` |
| Row order | Item order | Newest first (`createdAt`) | Item order |

**Implemented:** on the Reports page the Period selector is disabled and reads "As of today" on
the two reports that ignore it, so it never looks applied when it is not. The periods the page
sends are "last 30 days" and "last 3 / 6 **calendar** months" back from today
(`resolveDateRange` in `src/utils/reports.js`).

**Current inventory versus history.** `summary`, `critical_items`, and the rows and `stockValue`
of `inventory_value` describe the active inventory now. `movement_history` and the
`incomingValue` / `outgoingValue` totals are history and keep the transactions of archived items.
With the same filters and no `search`, `incomingValue` and `outgoingValue` always equal the sums
of the `movement_history` rows of each type.

Response (same envelope for every type):
```json
{ "type": "summary",
  "totals": { "totalItems": 6, "available": 3, "lowStock": 2, "outOfStock": 1 },
  "breakdown": [],
  "rows": [ { "id": 1, "itemId": 1, "categoryId": 1, "quantity": 500, "unit": "box", "totalValue": 6250, "status": "available" } ],
  "pagination": { "page": 1, "pageSize": 5, "totalItems": 6, "totalPages": 2 } }
```
`totals` always covers the whole filtered result, not just the current page.

| Type | `totals` keys | `rows` fields (besides `id`, `itemId`) |
|---|---|---|
| `summary` | `totalItems`, `available`, `lowStock`, `outOfStock` | `categoryId`, `quantity` (available), `expiredQuantity`, `unit`, `totalValue` (available value), `status` |
| `movement_history` | `incomingCount`, `outgoingCount` (issues only), `disposalCount`, `itemsCount`, `transactionsCount` | `type`, `reason`, `quantity`, `date`, `supplier`, `recipient`, `unitCost`, `totalValue` |
| `critical_items` | `totalItems`, `lowStock`, `outOfStock`, `expired`, `expiringSoon`, `expiring` (= `expired` + `expiringSoon`), `alerts` | `categoryId`, `quantity`, `minQty`, `unit`, `status` |
| `inventory_value` | `totalItems`, `stockValue` (available), `expiredValue` (awaiting disposal), `incomingValue`, `outgoingValue` (issues only), `disposedValue` | `categoryId`, `quantity` (available), `expiredQuantity`, `unit`, `unitCost`, `totalValue` (available value) |

- Every outgoing transaction is counted once: in `outgoingCount` / `outgoingValue` if it is an
  issue, or in `disposalCount` / `disposedValue` if it is an expired stock disposal.
- In `critical_items` (and `/dashboard/critical-inventory`) an item can have a stock row, an
  `expired` row and an `expiring_soon` row. The expired row's `quantity` is the expired stock
  awaiting disposal; the expiring-soon row's is the stock in the batches about to expire.


- `breakdown` is returned by `inventory_value` only: `[{ "categoryId": 1, "value": 6381.25 }]`, highest value first. Other types return `[]`.
  The Reports page no longer charts it: the Inventory Value chart compares `incomingValue` with `outgoingValue`.
- `critical_items` rows follow the same one-row-per-problem rule as `/dashboard/critical-inventory`;
  `totalItems` is the number of distinct items and `alerts` the number of rows.
- `movement_history` `totalValue` is `quantity * unitCost` for both types, using the `unitCost` stored on the transaction
  (incoming: the purchase price; outgoing: the Average Cost snapshot). `null` only when that cannot be calculated.
- `incomingValue` / `outgoingValue` are the sums of that same `quantity * unitCost` over the incoming / outgoing
  transactions in the `from`-`to` range (cancelled ones excluded, archived items' ones included).
- The Inventory Value donut compares `incomingValue` with `outgoingValue`. Its legend shows the two
  labels only; the amounts are in the cards beside it.

**Today (implemented):** Export PDF and Generate Report are handled in the browser through the
print dialog. The export asks for one page of 1000 rows; if the report has more, only the first
1000 are exported, and the page and the export's header say so.

#### Export (decided, decision 25; planned)

All exports are produced **by the backend**, in three formats, with **no row limit**:

| Method | Endpoint | Access | Response |
|---|---|---|---|
| GET | `/reports/:type/export?format=pdf\|xlsx\|csv&from=&to=&categoryId=&itemId=&search=` | Any signed-in user | The file, as a download (`Content-Disposition: attachment`), with the same filters and rows as `GET /reports/:type` but every row and no `page` / `pageSize` |

- Every file starts with the **report information**: report name, generated by (name and role),
  generated at (date and time, `Asia/Gaza`), period (`from`–`to`, or "As of today" for the reports
  that ignore it), every filter in words (category and item **names**, search text), and the
  number of rows. Then the table and the report's totals.
  - PDF: a header block above the table.
  - Excel: the information rows above the table on the same sheet.
  - CSV: **decided:** the information and filters as the first lines, then a blank line, then
    the table.
- The file is written completely first. **Only after it was produced successfully** is the export
  recorded in the export log (below) and the file sent. A failed export records nothing and
  returns an error in the usual format.
- `422` for an unknown `format`. **Decided:** all four reports can be exported, Critical Items
  included (today it has no export button).
- **Mock mode (decided, planned):** a browser cannot run the backend's file generation, so in mock
  mode the page keeps today's print-dialog PDF, and the Excel and CSV buttons are disabled with a
  note that they need the server.
- **Decided:** item names are in English only, so the PDF is built with a library without Arabic
  text shaping (dompdf). Arabic names would need a different library (mPDF).
- **Known limitation:** a very large PDF takes noticeably longer than the same Excel or CSV file.

**Export log.** Every successful export is stored in `report_exports`:
`{ userId, reportType, format, filters, periodFrom, periodTo, rowCount, exportedAt }`. `filters` holds the
filters exactly as sent (ids, not names), and `exportedAt` is the server time (`Asia/Gaza`). There
is no endpoint or page to read the log yet: it is kept in the database for later.

### 4.9 Profile and Settings

The storekeeper **Profile** page and the admin **Settings** page both use these endpoints.
They always act on the user identified by the token.

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/profile` | Any signed-in user | Returns the `User` |
| PUT | `/profile` | Any signed-in user | Request `{ "name", "email", "phone" }` → the `User`. `409` if the email is taken |
| PUT | `/profile/password` | Any signed-in user | Request `{ "currentPassword", "newPassword" }`. `422` if `currentPassword` is wrong (field `currentPassword`) or `newPassword` is shorter than 6 characters (field `newPassword`). No response body needed |

- `PUT /profile` applies the same `name` / `email` rules as `PUT /users/:id` (section 4.2).
- There is no separate `/settings` endpoint, and the Settings page has no settings beyond the
  profile and password.
- **Implemented:** on the Settings page the profile and the password are two requests, and each
  outcome is reported on its own ("Your profile was saved, but your password was not changed: ...").
  Nothing is reported as saved unless its request succeeded. The same applies to an admin editing
  a user and setting a new password on the Users page.
- The storekeeper Profile page only shows the profile and changes the password. Whether a
  storekeeper may change their own name, email or phone through `PUT /profile` is an **open
  decision** (the endpoint allows it; the UI does not offer it).
- **Deferred (decision 27):** changing one's own email from the Profile page, and confirming a new
  email by message, wait for the team's discussion. Nothing is built for them. The admin's Settings
  page keeps the profile form it already has.

## 5. Search, filtering, sorting and pagination

**Search (implemented).** The Navbar search box stores its text in the URL as `?q=`, updated
300 ms after typing stops. Each list page reads it and passes it to its service as `search`,
which becomes the `?search=` query parameter above. The backend does the matching (substring,
case-insensitive); the fields each endpoint should match are listed with that endpoint. The box
is disabled on Settings and Profile, which have nothing to search.

**Filters.**

| Page | Sent to the service | Applied in the page to the loaded rows |
|---|---|---|
| Inventory | `search` | Category, stock status |
| Inventory, Archived view | `search` | Category |
| Transactions | `search`, `itemId`, `from`, `to` | Nothing |
| Reports | `from`, `to`, `categoryId`, `itemId`, `search`, `page`, `pageSize` | Nothing |
| Notifications | `search` | Type tab (with a count per tab) |
| Users | `search` | Nothing |

**Sorting.** The frontend never sorts. Lists are shown in the order the service returns them;
the order each endpoint should use is given with that endpoint. The planned alert priority
(section 4.6) is therefore applied by the backend and the mock, not by the pages.

**Pagination.** Only `/reports/:type` is paginated by the server (`page`, `pageSize`, and
`pagination` in the response). Every other list endpoint returns all rows, and the Inventory and
Transactions pages show the first 10 / 8 with a "View All" button. That is a **known limitation**:
it is fine for the demo data and will not scale. **Decided (decision 9):** `/inventory`,
`/transactions/*`, `/users` and `/notifications` stay unpaginated for now, and the three lookup
endpoints (`/inventory/lookup`, `/inventory/batches/lookup`, `/users/directory`), which return
every record so ids can be shown as names, stay as they are.
Each page that shows names loads those lookups when it opens.

## 6. Mock mode notes

- Seed data lives in `src/mockData`. The mock database (`src/services/mock/mockDb.js`) copies it
  into memory and keeps it in `sessionStorage`, so changes survive a refresh and reset when the
  browser tab is closed.
- Stock, batches, dashboard numbers, notifications and reports are all computed from the same
  items and transactions, so the mock behaves like one consistent database.
- Mock tokens look like `mock-token-<userId>`. They are not signed and provide no security.
- The mock stands in for the backend's authentication and role checks (`authorize` in
  `src/services/mock/mockDb.js`, called from `request.js` with each service's `access` level):
  no session or a deactivated account gives `401`, an admin-only service called by a storekeeper
  gives `403`. This exists so those paths can be exercised in the UI. It runs in the browser and
  protects nothing.
- The mock identifies the acting user from the token, as the backend will, so no service takes a
  user id to say who is acting (notifications, profile, recording and cancelling transactions).
- Notification read state is stored per user.
- `npm run check:services` runs service-level checks of these rules against the seed data
  (`scripts/service-checks.mjs`). They call the service functions directly; they are not browser
  tests. The project has no test framework.
- Demo accounts. **Development only:** they exist in `src/mockData/usersMock.js`, work only in
  mock mode and must never be created on a real server.
  - Admin: `sara@medcenter.ps` / `admin123`
  - Storekeeper: `omar@medcenter.ps` / `store123`
  - Inactive (cannot log in): `mahmoud@medcenter.ps` / `store123`

## 7. What the backend must enforce

The frontend validates forms and hides what a role should not see, for a better experience. None
of that is protection: every rule below has to be enforced by the server, because any request can
be sent without the UI.

1. **Authentication.** Verify credentials against hashed passwords; issue signed, expiring
   tokens; reject missing, invalid or expired tokens and deactivated accounts with `401`.
2. **Authorization.** Check the role on every endpoint ("Access" columns in section 4). Take the
   acting user from the token only.
3. **Validation.** Every table of rules in sections 3 and 4, with the statuses and field names
   given, so the forms can show the message under the right input.
4. **Stock integrity.** A batch can never go below zero at any point in its history; an outgoing
   transaction can never exceed its batch; an edit is all-or-nothing in one database transaction.
5. **Derived values.** Stock, batch quantities, Average Cost, stock status, expiry status, alerts,
   dashboard numbers and report totals are calculated by the server from active transactions.
   The frontend only displays them.
6. **Archiving.** Never delete an item; enforce the rules in "Archived items", require the reason
   and keep the full archive history (planned).
7. **Cancelling.** Never delete a transaction; enforce the rules in "Cancelled transactions".
8. **Notifications.** Generate the alerts in section 4.6, store read state per user, show account
   alerts only to their audience and return every list in priority order (planned).
9. **Accounts (planned).** Refuse login (`403`) and every request (`401`) for an expired account;
   never let the admin account expire.
10. **Barcodes and manufacturers (planned).** Keep every barcode unique system-wide, block barcode
    changes on archived items, never create a duplicate manufacturer by spelling, and keep batch
    numbers unique per item and manufacturer.
11. **Exports (planned).** Build every export file on the server, with the report information,
    and log it only after it was produced.

## 8. Known limitations and open decisions

**Known frontend limitations**

- No automated UI tests and no test framework. `npm run check:services` covers the mock data
  layer's rules only.
- The real API mode has never run against a server: every `api` branch is written to this
  contract but untested.
- Lists other than reports are not paginated (section 5). The PDF export holds at most 1000 rows
  (section 4.8) until the planned backend export replaces it.
- Each page that shows names loads the three lookup lists when it opens; they are not shared
  between pages.
- The dashboard stock movement chart adds quantities of different units (section 4.7).
- The mock layer and demo accounts are compiled into the bundle even in API mode (section 1).
- The session token is kept in web storage, and there is no token refresh.
- The app is one JavaScript bundle (about 500 kB); routes are not split.

**Decisions.** "Decided" rows are settled for the backend. "Open" rows were not discussed yet: the
backend follows the behaviour shown until they are. "Deferred" rows were postponed on purpose and
nothing is built for them. Rows 19–27 come from the supervisor's review; their frontend parts are
planned.

| # | Question | Status | Answer / current behaviour |
|---|---|---|---|
| 1 | May an item with stock be archived, and what happens to the stock? | Open | Refused with `409` until the stock is 0 and no expired stock awaits disposal |
| 2 | Who may archive / restore items, and edit or cancel transactions recorded by someone else? | Decided | Any signed-in user (admin or storekeeper). Who recorded, edited and cancelled is kept |
| 3 | Must quantities be whole numbers? | Decided | Yes, quantities and `minQty`. The mock still accepts any number above 0 |
| 4 | May a transaction be dated in the future? May an already expired batch be received? | Decided | No future dates. A batch whose `expiryDate` is before its receipt `date` is refused; `expiryDate` may be `null` |
| 5 | Who may record an expired stock disposal? | Decided | Any signed-in user (issuing expired stock is refused for everyone) |
| 6 | Money: stored precision and the currency | Decided | US dollars; unit costs to 4 decimals, totals to 2 |
| 7 | Which time zone defines "today" | Decided | `Asia/Gaza`, on the server. The mock uses the browser's local date |
| 8 | Token lifetime, refresh and storage | Decided | Sanctum token, 24 hours or 30 days with "Remember me"; no refresh; web storage |
| 9 | Pagination for inventory, transactions, users, notifications; lookups versus embedded names | Decided | Not paginated for now (reports are); the three lookup endpoints stay |
| 10 | Report export beyond 1000 rows | Decided | No limit: exports are built by the backend (decision 25). Until then, truncated and labelled |
| 11 | Can more admins be created, roles changed, users deleted? | Decided | One admin from the seeder; only storekeepers are created; no role changes; users are deactivated, never deleted |
| 12 | May a storekeeper edit their own name / email / phone? | Open | Endpoint allows it; UI does not offer it. Changing one's own email is deferred (decision 27) |
| 13 | Self-service password reset by email | Open | Not available; an admin sets a new password |
| 14 | Are alerts stored or derived; meaning of `createdAt`; unread again when they return? | Open | Derived from the stock state; `createdAt` is when the condition was first seen; unread again when it returns |
| 15 | When is `lastActiveAt` updated? | Open | At login only |
| 16 | Is stock valued at the item's Average Cost or per batch? Should a disposal produce an accounting write-off? | Decided | One moving Average Cost per item, for available, expired and disposed stock. Expired stock awaiting disposal stays in the quantity the average is built on; a disposal does not change the average. No write-off entry |
| 17 | Who may see the reports? | Decided | Both roles, all four reports (storekeeper page planned) |
| 18 | Is the history of edits to a transaction kept? | Decided | Yes, every edit with who, when, old and new values ("Edit history", section 3). Manufacturer and manufacturing date changes are included |
| 19 | Barcodes: QR or barcode, generated or factory, one per item or many? | Decided | Factory barcodes only, no generated codes. Several per item, each linked to a manufacturer, unique system-wide (archived items included). No barcode changes on an archived item. An unknown barcode can be linked from Incoming. A different pack size is a different item ("Barcodes and manufacturers", section 3) |
| 20 | Where does the manufacturer belong, and what makes a batch number unique? | Decided | On the batch, never the item; one item across manufacturers, one Average Cost. Batch number printed by the manufacturer, unique per item + manufacturer among active batches; no manufacturer = one group |
| 21 | How are manufacturers added? | Decided | From the Incoming form with autocomplete; a new name creates one; no management page; spellings that differ only in case, spaces, dots, commas or other punctuation are the same manufacturer |
| 22 | Item details, archive reason and history | Decided | Six optional item fields (active ingredient, strength, dosage form, storage conditions, uses, description); manufacturing date and optional supplier on the batch; archiving requires a reason; every archiving and restore is kept in an archive history |
| 23 | User expiry | Decided | Account expiry (not password expiry), storekeepers only, date set by the admin; alerts 7 days before and on the last day, to the admin and the storekeeper; expired accounts cannot sign in and their tokens get `401`; no extension request |
| 24 | Alert priority | Decided | Every alert type kept; order: expired, out of stock, expiring soon, low stock, then account alerts; the same ranks in Critical Inventory |
| 25 | Report export | Decided | PDF, Excel and CSV, all built by the backend, no row limit, with the report information in the file; each successful export logged in `report_exports`; no page for the log yet |
| 26 | Insurance support | Deferred | Nothing is built: no field, table or endpoint |
| 27 | Changing one's own email from Profile, and email confirmation | Deferred | Waits for the team's discussion; nothing is built |

**Confirmed details of decisions 19–25** (no question is left open for them):

| Topic | Answer |
|---|---|
| Account expiry | `accountExpiresOn` is the last working day; the account stops the next day |
| Account expiry | No past date; to stop an account now, set it `inactive` |
| Account expiry | No alert after expiry; the Users page shows "Expired" |
| Alerts | Account alerts come last; `/dashboard/critical-inventory` uses the same ranks |
| Manufacturers | Case, spaces, dots, commas and other punctuation are ignored when matching names |
| Item details | `dosageForm` is free text |
| Barcodes | Linking a barcode always needs its manufacturer; barcodes are managed by their own endpoints, not the item form |
| Outgoing | The chosen manufacturer's batches come first, nearest expiry first, from the backend; any batch can still be picked |
| Export | CSV starts with the report information and filters; all four reports can be exported; Excel / CSV are disabled in mock mode; item names are English only (dompdf) |

## 9. Database design (backend)

The Laravel migrations in `Meditrack-Back/database/migrations` build this schema. Every table has
an `id`. Records that history points at (users, items, batches, transactions, manufacturers) are
never deleted, and the foreign keys refuse a delete (`restrict`). Fixed values are stored as text
and checked by PHP enums in `app/Enums`.

**Built (phase 1)**

| Table | Columns |
|---|---|
| `users` | `name`, `email` (unique), `password` (hashed), `role`, `status`, `phone`, `last_active_at`, timestamps |
| `categories` | `name` (unique), timestamps |
| `items` | `category_id`, `name`, `unit`, `min_qty`, `avg_unit_cost` DECIMAL(12,4) (cached), `archived_at`, timestamps |
| `batches` | `item_id`, `batch_number`, `unit_cost` DECIMAL(12,4), `supplier`, `expiry_date` (nullable), `quantity` (cached physical stock), timestamps |
| `transactions` | `type`, `reason`, `item_id`, `batch_id`, `quantity`, `unit_cost` DECIMAL(12,4), `recipient`, `date`, `recorded_by`, `status`, `cancelled_at`, `cancelled_by`, timestamps |
| `transaction_revisions` | `transaction_id`, `edited_by`, `edited_at`, `old_values` JSON, `new_values` JSON |
| `notifications` | `key` (unique, e.g. `low_stock-4`), `type`, `item_id`, `batch_id` (nullable), `first_seen_at` |
| `notification_reads` | `notification_id` (deleted with its alert), `user_id`, `read_at`; unique per alert and user |
| `personal_access_tokens` | Sanctum tokens, hashed, with `expires_at` |

**Planned changes (decisions 19–25; the phase 1 migrations are edited and the database rebuilt,
since it holds demo data only)**

| Table | Change |
|---|---|
| `users` | + `account_expires_on` DATE nullable (storekeepers only) |
| `items` | + `active_ingredient`, `strength`, `dosage_form`, `storage_conditions` (strings), `uses`, `description` (text), all nullable |
| `manufacturers` (new) | `name` (spelling first entered), `normalized_name` (unique: lowercase, spaces and punctuation removed), timestamps |
| `item_barcodes` (new) | `item_id`, `manufacturer_id`, `barcode` (unique system-wide), timestamps |
| `batches` | + `manufacturer_id` nullable, + `manufacturing_date` DATE nullable; `supplier` becomes nullable. Batch-number uniqueness (item + manufacturer, active batches only, no manufacturer = one group) is checked by the application, because a unique index cannot express "active only" |
| `item_archivals` (new) | `item_id`, `reason`, `archived_by`, `archived_at`, `restored_by` nullable, `restored_at` nullable. One row per archiving; at most one open row per item. `items.archived_at` stays as the current state, written in the same database transaction |
| `notifications` | `item_id` becomes nullable; + `user_id` nullable (the account an account alert is about) |
| `report_exports` (new) | `user_id`, `report_type`, `format`, `filters` JSON, `period_from` / `period_to` DATE nullable, `row_count`, `exported_at` |
| `transaction_revisions` | No change: `manufacturerId` and `manufacturingDate` are new keys inside the JSON |

**Not added:** anything for insurance (decision 26) or for changing one's own email (decision 27).
