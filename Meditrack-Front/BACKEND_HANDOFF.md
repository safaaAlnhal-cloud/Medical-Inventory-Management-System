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

Every statement belongs to one of four kinds, and the text says which:

| Label | Meaning |
|---|---|
| **Implemented** | The frontend does this today, in both mock and API mode |
| **Mock only** | Simulated in the browser so the UI can be developed. It is not real and gives no security |
| **Backend must** | The frontend relies on it, but only a server can really do it |
| **Open decision** | Not settled. Section 8 lists them all; the mock uses the safest non-destructive behaviour |

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
| `VITE_API_BASE_URL` | URL | Base URL of the API. Default `http://localhost:5000/api` |

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
| Base URL | `VITE_API_BASE_URL`, e.g. `http://localhost:5000/api` |
| Format | JSON request and response bodies |
| Response body | The resource itself, with no envelope. If you prefer `{ "data": ... }`, tell the frontend team: it is a one-line change in `unwrap` in `src/services/apiAxios.js` |
| IDs | Any stable unique value (number or string). Entities reference each other by id only |
| Dates | ISO 8601. Date-only fields are `YYYY-MM-DD`; timestamps are full ISO strings (`2026-10-08T10:15:00.000Z`) |
| Numbers | Quantities, prices and totals are JSON numbers, never formatted strings |
| Money | The UI shows 2 decimals with one currency symbol, defined once in `src/utils/formatters.js` (`CURRENCY_SYMBOL`, currently `$`). Totals are rounded to 2 decimals; unit costs keep up to 4 (see "Average Cost and Unit Cost"). The currency itself is an open decision |
| Time zone | Date-only values are calendar dates with no time zone. "Today" (expiry, report periods) is an open decision: the mock uses the browser's local date |
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
  deactivated, so that user is signed out instead of staying on screen with every request failing.
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
- **Open decisions:** token lifetime and refresh, and where the token is stored (it is in
  `localStorage` / `sessionStorage` today).

Route and role structure (**implemented**, `src/routes`):

| Path | Who | Page |
|---|---|---|
| `/` | Public | Landing page |
| `/login` | Public (a signed-in user is sent to their dashboard) | Login |
| `/admin/dashboard`, `/admin/inventory`, `/admin/transactions`, `/admin/users`, `/admin/reports`, `/admin/notifications`, `/admin/settings` | Admin | |
| `/storekeeper/dashboard`, `/storekeeper/inventory`, `/storekeeper/transactions`, `/storekeeper/notifications`, `/storekeeper/profile` | Storekeeper | |

A signed-out user is sent to `/login`; a user opening the other role's path is sent to their own
dashboard. Inventory, Transactions and Notifications are the same pages for both roles.

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
| Item | `name`, `categoryId`, `unit`, `minQty` |
| Transaction | `type`, `itemId`, `quantity`, `unitCost`, `date`, `expiryDate`, `batchNumber`, `supplier`, `batchId`, `recipient` |
| User | `name`, `email`, `password`, `status`, `newPassword` |

If `message` is missing, the frontend shows a generic message for the status code. A request that
gets no answer within 20 seconds is reported as a timeout. Statuses the frontend expects:

| Status | Meaning |
|---|---|
| 400 / 422 | Validation failed |
| 401 | Missing, invalid or expired token, deactivated account (or wrong credentials on login) |
| 403 | Authenticated but not allowed (wrong role; inactive account **at login**) |
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

### Batch
```json
{ "id": 5, "itemId": 1, "batchNumber": "PC-101", "unitCost": 12, "supplier": "PharmaCo", "expiryDate": "2027-12-12" }
```
- `id` is the **unique internal identifier** of the batch. Transactions and notifications
  reference a batch by this id (`batchId`), never by its number.
- `batchNumber` is the label printed on the box. It is only displayed to users. It must be unique
  per item, but two different items may use the same number.
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
  The exact precision and type the database uses is an **open decision**; the rule to keep is
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

**Open decision:** who may archive and restore. Today any signed-in user may, as with the other
inventory actions.

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
  "unique per item" rule applies only to batches whose incoming transaction is active.

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
| `quantity` | yes | yes | Greater than 0 |
| `date` | yes | yes | A real date, `YYYY-MM-DD` |
| `batchNumber` | yes | no | Renames the batch this transaction received. Unique per item among active batches |
| `unitCost` | yes | no | Zero or more. Also stored on the batch |
| `expiryDate` | yes | no | A real date or `null`. Also stored on the batch |
| `supplier` | yes | no | Required. Also stored on the batch |
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
| Incoming: the item already has an active batch with that number | `409` |
| Incoming whose batch has active outgoing transactions: item changed, quantity below what was issued, or changed to outgoing | `409` |
| Incoming: `date` later than the first date stock was issued from its batch | `422` |
| Outgoing: `batchId` is not a batch of that item with an active receipt | `422` |
| Outgoing: quantity above what the batch has available to it (its own previous quantity counts as available) | `422` |
| Outgoing: the batch was recorded as received after this transaction was recorded (`createdAt`) | `422` |
| Outgoing: `date` earlier than the date the batch was received | `422` |
| Anything else that would leave a batch negative at any point of its history | `409` |

Batch handling:

- Incoming stays incoming: the same batch record is updated (`itemId`, `batchNumber`, `unitCost`,
  `supplier`, `expiryDate`). Its id does not change, so outgoing transactions keep pointing at it.
- Outgoing to incoming: a new batch is created; the quantity it had issued returns to the old batch.
- Incoming to outgoing: the batch it received no longer has a receipt and leaves stock. The
  record is kept so its number still resolves in `GET /inventory/batches/lookup`.

The same date rule now also applies when recording: `POST /transactions/outgoing` returns `422`
if `date` is earlier than the date its batch was received.

Until the backend exists, the frontend simulates all of this in `updateMock` in
`src/services/transactionsApi.js`, run through `transact` in `src/services/mock/mockDb.js`
(works on a copy and only keeps it if nothing failed), with `isStockConsistent` in
`src/services/mock/mockSelectors.js` as the final check.

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
- **Access:** any signed-in user, like the other transaction endpoints (open decision 2).

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
  (**open decision 16**).
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

`POST /auth/login` request: `{ "email": "<email>", "password": "<password>" }`

Response `200`:
```json
{ "token": "<jwt>", "user": { "id": 1, "name": "Sara Ahmed", "email": "sara@medcenter.ps", "role": "admin" } }
```
Errors: `401` wrong email or password; `403` account is inactive.
Inactive users must not be able to log in.

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

Validation (**backend must**; the mock applies the same rules):

| Rule | Status | Field |
|---|---|---|
| `name` is required (not only spaces) | `422` | `name` |
| `email` is a valid address | `422` | `email` |
| `email` is not used by another account (case-insensitive) | `409` | `email` |
| `password` / `newPassword` has at least 6 characters (`MIN_PASSWORD_LENGTH`) | `422` | `password` / `newPassword` |
| `status` is `active` or `inactive` | `422` | `status` |
| An admin cannot deactivate the account they are signed in with | `409` | `status` |

**Open decisions:** the UI only creates storekeepers and never changes a role or deletes a user;
whether more admins can be created, and whether the last active admin must be protected in other
ways, is not settled. `lastActiveAt` is updated by the mock at login only.

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
| PATCH | `/inventory/:id/archive` | Any signed-in user | Archives the item (this is what "Delete" does). No body. Returns the `Item`. `409` while it has stock or if it is already archived |
| PATCH | `/inventory/:id/restore` | Any signed-in user | Restores an archived item. No body. Returns the `Item`. `409` if it is not archived or an active item has the same name |

There is no `DELETE /inventory/:id`: items are never removed. All rules are in "Archived items"
in section 3.

`POST` / `PUT` request: `{ "name": "Bandage Roll", "categoryId": 2, "unit": "pack", "minQty": 0 }` → the full `Item`.
A new item has `quantity` 0 until an incoming transaction is recorded.

| Rule | Status | Field |
|---|---|---|
| `name` is required (not only spaces) | `422` | `name` |
| `name` is not used by another **active** item (case-insensitive) | `409` | `name` |
| `categoryId` is an existing category | `422` | `categoryId` |
| `unit` is one of the units in section 2 | `422` | `unit` |
| `minQty` is a number, zero or more | `422` | `minQty` |

### 4.5 Transactions

| Method | Endpoint | Access |
|---|---|---|
| GET | `/transactions/incoming?search=&itemId=&from=&to=` | Any signed-in user |
| POST | `/transactions/incoming` | Any signed-in user |
| GET | `/transactions/outgoing?search=&itemId=&from=&to=` | Any signed-in user |
| POST | `/transactions/outgoing` | Any signed-in user |
| PUT | `/transactions/:id` | Any signed-in user |
| GET | `/transactions/:id/batch-options?itemId=` | Any signed-in user |
| POST | `/transactions/disposal` | Any signed-in user |
| PATCH | `/transactions/:id/cancel` | Any signed-in user |

`GET` returns `Transaction[]` of that type, newest first (`createdAt` descending), **including
cancelled transactions** (the page shows them with a Cancelled badge).
`from` / `to` are inclusive ISO dates applied to `date`. `search` matches item name, batch number,
supplier, recipient and the recorder's name. All query parameters are optional.

`POST /transactions/incoming` request:
```json
{ "itemId": 4, "batchNumber": "SS-402", "quantity": 100, "unitCost": 4.5, "date": "2026-10-08",
  "expiryDate": "2027-03-01", "supplier": "BioLab" }
```
- Every incoming transaction **creates a new batch** with a new unique id. The response carries
  that id as `batchId`.
- `batchNumber` is the label the user typed. `409` if the item already has an active batch with
  that number (a batch whose incoming transaction was cancelled does not count).
- `date` and `expiryDate` must be real dates (`422` otherwise).
- `expiryDate` may be `null`.
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
| `quantity` is a number greater than 0 | `422` | `quantity` |
| `date` is present and a real `YYYY-MM-DD` date | `422` | `date` |
| Incoming: `unitCost` is a number, zero or more (missing is rejected, not read as 0) | `422` | `unitCost` |
| Incoming: `batchNumber` is required | `422` | `batchNumber` |
| Incoming: the item has no active batch with that number | `409` | `batchNumber` |
| Incoming: `expiryDate` is `null` or a real date | `422` | `expiryDate` |
| Incoming: `supplier` is required | `422` | `supplier` |
| Outgoing: `batchId` is a batch of that item with stock | `422` | `batchId` |
| Outgoing: `quantity` is not more than the batch holds | `422` | `quantity` |
| Outgoing: `date` is not before the date the batch was received | `422` | `date` |
| Outgoing: `recipient` is required | `422` | `recipient` |

**Open decisions** (the mock does not restrict these): whether a quantity must be a whole number
(the forms only offer whole numbers, the mock accepts any number above 0); whether a transaction
date may be in the future; whether a batch that is already expired may be received.

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

`PATCH /transactions/:id/cancel` has no request body. Response `200` with the `Transaction`
(`status: "cancelled"`, `cancelledAt`, and `cancelledBy` taken from the token). `404` if not
found; `409` if it is already cancelled, if it belongs to an archived item, or if it is an
incoming transaction whose batch has active outgoing transactions. All rules are in "Cancelled
transactions" in section 3.

**Open decision:** any signed-in user may edit or cancel any transaction, including one recorded
by someone else. Confirm this before the backend encodes it.

### 4.6 Notifications

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/notifications?search=` | Any signed-in user | Returns `Notification[]`, newest first. The frontend filters by type and counts per tab itself |
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

- An item has at most one stock alert, and each batch at most one expiry alert, so the same
  condition is never reported twice. Archived items raise none.
- There are no notifications for individual transactions, users or sign-ins.
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
| GET | `/dashboard/alerts?search=&limit=3` | Any signed-in user | `Notification[]`, most severe first: out of stock, low stock, expired, then expiring soon; equal ranks newest first. Both dashboards show the first 5 |
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
  the same alerts. `/dashboard/alerts` returns nothing a user could not already read on
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
| GET | `/reports/:type?from=&to=&categoryId=&itemId=&search=&page=&pageSize=` | Admin |

`:type` is `summary`, `movement_history`, `critical_items` or `inventory_value`. An unknown type is `404`.
The frontend requests `pageSize=5` for the table and `pageSize=1000` when exporting.

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

Export PDF and Generate Report are handled in the browser. They need no extra endpoint.
**Known limitation:** the export asks for one page of 1000 rows. If the report has more, only
the first 1000 are exported; the page says so in a message and the export's header reads
"Showing the first 1000 of N records". **Backend should** either allow a larger `pageSize` for
exports or provide a dedicated export endpoint; that is an open decision.

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
the order each endpoint should use is given with that endpoint.

**Pagination.** Only `/reports/:type` is paginated by the server (`page`, `pageSize`, and
`pagination` in the response). Every other list endpoint returns all rows, and the Inventory and
Transactions pages show the first 10 / 8 with a "View All" button. That is a **known limitation**:
it is fine for the demo data and will not scale. **Open decision:** the pagination contract for
`/inventory`, `/transactions/*`, `/users` and `/notifications`, and whether the three lookup
endpoints (`/inventory/lookup`, `/inventory/batches/lookup`, `/users/directory`), which return
every record so ids can be shown as names, should be replaced by names embedded in the responses.
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
6. **Archiving.** Never delete an item; enforce the rules in "Archived items".
7. **Cancelling.** Never delete a transaction; enforce the rules in "Cancelled transactions".
8. **Notifications.** Generate the alerts in section 4.6 and store read state per user.

## 8. Known limitations and open decisions

**Known frontend limitations**

- No automated UI tests and no test framework. `npm run check:services` covers the mock data
  layer's rules only.
- The real API mode has never run against a server: every `api` branch is written to this
  contract but untested.
- Lists other than reports are not paginated (section 5). The PDF export holds at most 1000 rows
  (section 4.8).
- Each page that shows names loads the three lookup lists when it opens; they are not shared
  between pages.
- The dashboard stock movement chart adds quantities of different units (section 4.7).
- The mock layer and demo accounts are compiled into the bundle even in API mode (section 1).
- The session token is kept in web storage, and there is no token refresh.
- The app is one JavaScript bundle (about 500 kB); routes are not split.

**Open decisions** (the mock's current behaviour is in brackets)

| # | Decision | Current behaviour |
|---|---|---|
| 1 | May an item with stock be archived, and what happens to the stock? | Refused with `409` until the stock is 0 |
| 2 | Who may archive / restore items, and edit or cancel transactions recorded by someone else? | Any signed-in user |
| 3 | Must quantities be whole numbers? | Forms offer whole numbers; the data layer accepts any number above 0 |
| 4 | May a transaction be dated in the future? May an already expired batch be received? | Both allowed |
| 5 | Who may record an expired stock disposal? | Any signed-in user (issuing expired stock is refused for everyone) |
| 6 | Money: stored precision and the currency | Unit costs to 4 decimals, totals to 2; symbol `$` in one constant |
| 7 | Which time zone defines "today" | The browser's local date |
| 8 | Token lifetime, refresh and storage | No expiry in the mock; web storage |
| 9 | Pagination for inventory, transactions, users, notifications; lookups versus embedded names | Not paginated; three lookup endpoints |
| 10 | Report export beyond 1000 rows | Truncated, and labelled as such |
| 11 | Can more admins be created, roles changed, users deleted? | Storekeepers can be created; nothing else |
| 12 | May a storekeeper edit their own name / email / phone? | Endpoint allows it; UI does not offer it |
| 13 | Self-service password reset by email | Not available; an admin sets a new password |
| 14 | Are alerts stored or derived; meaning of `createdAt`; unread again when they return? | Derived on read; first seen; yes |
| 15 | When is `lastActiveAt` updated? | At login only |
| 16 | Is stock valued at the item's Average Cost or per batch? Should a disposal produce an accounting write-off? | Average Cost for available, expired and disposed stock; no write-off entry |
