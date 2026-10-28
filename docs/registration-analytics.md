# Registration analytics (Sales Workspace)

Read-only. Routes: `GET /api/sales/registrations/{summary,users,follow-ups}` (`src/server/registrationAnalytics.ts`). Any other method is 405; any other path under it is 404. Roles: SalesExecutive, SalesManager, SuperAdmin (`REGISTRATION_ANALYTICS_ROLES`) — a separate permission from `requireAdminOrManager`, granting no user management.

## Who counts as a registered user
Role is not staff (`STAFF_ROLES`, the same "member" rule the campaign board uses), `isDemoAccount = false`, status not `PENDING_DELETION`/`DELETED`, `purgedAt` empty. A filter over `User`, so a person is counted once however many subscriptions or leads they have. Blocked accounts and institution-added members (role `Student`) are included. The admin daily digest uses a narrower rule (`Subscriber`/`Institution` only), so its count can be lower.
Test accounts can only be recognised by `isDemoAccount`; there is no other marker, so none is guessed.

## Dates
Whole Asia/Kolkata days, `[start, end)` over UTC instants (`src/lib/registrationWindows.ts`). Today = since 00:00 IST. Last 7 / 30 days include today. Previous period = same number of days immediately before. Custom: real dates, in order, not future, at most 366 days. Zero days are filled in the graph. A zero previous period gives "new"/"flat", never a percentage.

## Verified
`User.emailVerifiedAt` is set (the same field Admin → Users filters on).

## Subscription state (one SQL expression, used by the counts and the table)
- **Active · Paid** — own subscription, Active, unexpired, not a "…Trial", bought through a Payment recorded `Paid` or `Success` (`Subscription.paymentId`).
- **Active · Via institution** — covered by the institution's running subscription (seat rules as `getUserActiveSubscriptions`).
- **Active · Not payment-linked** — running access with no recorded payment: admin grant, Pro approval, offline payment never linked.
- **Trial / Expired / Cancelled / No subscription** — not active. "Without an active subscription" = these four.

## Conversion
Cohort = members registered in the selected period. Converted = of those, ones with a payment-backed subscription whose `createdAt` (written in the transaction that marks the Payment Paid) is before the period end. Lower bound: offline/admin-granted subscriptions have no payment link and are not counted.

## Individual records
Only members whose email matches (case-insensitively) a `Lead` assigned to the caller (`Lead.assignedToId`). There is no User → executive column. Nothing is assigned automatically. Columns: name, email, organisation, registered date, verified, subscription, and the lead id (to open the existing lead page). No export, no per-id route.

## Ambiguous ownership
An address can sit on leads of two executives. Such a member is listed for neither; each is told how many were held back (`ambiguous`), with no names. A duplicate lead that is unassigned does not make ownership ambiguous.

## Why "could not be loaded" appeared on localhost
The dev server (`npm run dev`, no watch) had been started before these routes existed, so `/api/sales/registrations/*` was not mounted and the app-shell fallback answered with `index.html` and HTTP 200; the page then failed to parse it as JSON. Unknown `/api/*` paths now return a JSON 404, and the screens tell a missing route (restart the server), an ended session, missing access, a network failure and a server error apart. Restart the dev server to pick the routes up.

## Demo data label
`REGISTRATION_DEMO_DATA=1` makes the three routes return `demo: true` and the screens show a "Demo data" badge. Set it only on a localhost run against a seeded test database; never in production.

## Closed gaps
- `/api/sales/leads/:id` (detail, status, notes): SalesExecutive and SalesManager may only open leads assigned to them (404 otherwise); SuperAdmin and SubscriptionManager, who already read every lead through `/api/admin/leads`, may open any.
- `POST /api/admin/subscription-requests` is now admin-only. Nothing in the product posted to it (the public form is `/api/domain-request`; a member's own request is the Pro application).

## Known gaps
- `/api/domain-request` (public) has no rate limit beyond the global API limiter.
- Optional indexes if the Subscription table grows large: `Subscription(userId)`, `Subscription(institutionId)`, `Payment(status)`. Not added; no migration is needed for this feature.

## Platform Overview on /sales/registered-users

The Registered Users page now opens with "Platform Overview — All Members": the same `/api/sales/registrations/summary` the dashboard reads (`<RegistrationAnalytics variant="platform" />`), so nothing is counted twice or differently.

| Figure | Definition |
|---|---|
| Total Registered Users | Eligible members, all time (see "Eligible member" above). |
| Registered Today / Last 7 / Last 30 Days | Fixed IST windows over the same members; they do not follow the chart's filter. |
| Daily registrations | Follows 7 Days / 30 Days / Custom (IST, zero-filled days), with the previous equivalent period; no percentage when that period is zero. |
| Verified / Unverified | `emailVerifiedAt` set / null. Adds up to the total. |
| Have read content / Never opened content | `User.lastReadAt`, the field Admin → Users counts as "Have read something". It is set only when a signed-in member's open of an item is granted; signing in, searching and viewing a record page do not set it. Adds up to the total. |

### Reconciliation with Admin → Users

Admin → Users lists **every row of the User table** (its default query has no filter), so its total includes staff, demo, deletion-queue/deleted and anonymised accounts. The page shows the exact walk, each account in one bucket in this order:

`all accounts = staff + demo + deletion queue/deleted + anonymised + registered members`

It also shows Admin's verified and have-read figures over all accounts beside the member figures. Accounts an institution added are members and are counted; their number is shown as information, not deducted. No counting rule was changed to make a particular total match.

### Permissions

The summary is counts only (no name, no email) and is available to SalesExecutive, SalesManager and SuperAdmin through GET only. Individual records stay limited to the executive's assigned leads (`/users`, `/follow-ups`); `/users` now also returns `assignedTotal`, the unfiltered assigned count, which the table reads against. The page adds no create, edit, delete, reset, role, subscription or export route.
