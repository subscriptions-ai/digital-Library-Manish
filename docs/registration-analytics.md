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

## Known gaps
- `/api/sales/leads/:id` (existing) does not check assignment; any sales user can open any lead by id. Not changed here.
- `POST /api/admin/subscription-requests` has no authentication.
- Optional indexes if the Subscription table grows large: `Subscription(userId)`, `Subscription(institutionId)`, `Payment(status)`. Not added; no migration is needed for this feature.
