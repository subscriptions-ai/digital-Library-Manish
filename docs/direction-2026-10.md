# DLM — direction & plan, October 2026

A plan written after a day inside the codebase. The intent is to answer "what is
DLM, what is it becoming, and what should we do next". This is a proposal; it is
Puneet's call to accept, reshape or reject.

## 1. What DLM is today

- A reader + paywall product at **journalslibrary.com**.
- 224 institutions, 180 librarians, 301 students, 230,171 ingested items.
- Access model: free preview (30-min sessions, 4/day, 2-hour gap) + paid
  subscriptions (reader-side plans and, now, institution department
  subscriptions with per-seat growth).
- Reader-side revenue flow: user asks → admin takes payment externally → admin
  marks it in `QuotationManager` → the server creates a `Receipt` and a
  `Subscription`. No self-serve Razorpay.
- Institution revenue flow: self-serve Razorpay, server-priced (shipped Oct 1,
  PRs #1 and #2 on `subscriptions-ai/digital-Library-Manish`).

## 2. What else is in the code

Reading the schema and the server routes, DLM also carries the pieces of three
other products:

- **Publisher back-office.** `Publisher`, `Journal`, `Article`, `Book`,
  `Chapter`, `Submission`, `PublisherAgreement`, `AgreementTemplate`,
  `PublisherMessage`, `PublisherUpload`, `IngestionState`, `IngestionRun`,
  `DepartmentSweep`.
- **Sales / CRM.** `Lead`, `LeadInteraction`, `DemoRequest`, `AgencyInquiry`,
  `ContactInquiry`, `Campaign`.
- **Marketing engine.** `EmailEngine`, `EmailRule`, `EmailSend`, `EmailLog`,
  `BlogPost`, `PageVisit`.

The code to run them is partly built, partly dormant. The reader side is the
only one with daily users against it.

## 3. The three risks worth naming

1. **Monolithic `server.ts`.** ~14,000 lines, no feature split. Finding the
   Razorpay flow or the free-clock gate is a grep, not a navigation. Any new
   contributor spends the first day lost.

2. **`prisma db push` on deploy, no migrations.** A destructive schema change
   stops the deploy from starting (not from dropping data, since
   `--accept-data-loss` is not passed — the live `start` script does not pass
   it, `DEPLOY_NOTES.md` is stale on that). But any schema evolution with any
   second environment, any team member, any rollback story is painful without a
   migration history.

3. **No payment reconciliation.** If a Razorpay webhook fails or the user
   closes the tab after paying, the `Payment` row stays `Pending` forever and
   the subscription never activates. The reader-side flow sidesteps this (admin
   records manually), but the institution flow would benefit from a nightly
   reconciliation once Razorpay is "approved" (Puneet's phrasing: approval
   configure karne par).

The payment-security hole that was here yesterday is **fixed** (PR #3,
2026-10-01 night).

## 4. The real question

**Scope.** Is DLM:

- **A.** A journalslibrary.com-focused reader + institution paywall, with the
  publisher/CRM/marketing side cut back to only what the reader side needs?
- **B.** A full publisher platform (reader + ingestion + agreements + editorial
  review + CRM + marketing), where the current sprawl is actually intentional
  and underinvested?

A and B are both valid; both are expensive. The expensive thing is pretending
to be both at once — every new feature costs more as the second-largest
unfinished thing is dragged along.

## 5. Phased plan — concrete

### Phase 0 — done 2026-10-01
- Institution department + seat pricing, server-priced Razorpay (PR #1).
- Free-preview seat-quote message fix (PR #2).
- Retire the client-trusted `/api/payment/order` and `/verify` (PR #3). No UI
  change; those routes return 410 Gone.

### Phase 1 — Scope decision (Puneet's call, pick A or B)
Pure decision, no code. Nothing in Phase 2+ is right without this.

### Phase 2 — "Make it a navigable codebase" (if A)
- Split `server.ts` into feature routers:
  `routes/auth.ts`, `routes/reader.ts`, `routes/institutions.ts`,
  `routes/admin.ts`, `routes/publishers.ts`, `routes/payments.ts`,
  `routes/marketing.ts`. Each imports a shared Prisma + auth-middleware.
- No logic changes. One PR per router. Measured by: can a new engineer open
  the right file for the thing they are changing?
- Fits in a week of focused work.

### Phase 3 — "Make the DB evolvable"
- Switch from `prisma db push` to `prisma migrate` on deploy.
- Baseline from the current schema (`prisma migrate resolve --applied`).
- First real migration can be: adding seat/department audit indexes, something
  additive and safe.
- Fits in 1-2 evenings.

### Phase 4 — Scope cut OR scope invest
If A: feature-flag off the publisher-side pages and admin screens. Keep the
schema (data has value), hide the UI. Remove the dormant routes that nobody
calls. Delete `digital-Library-Manish/` nested stale copy from the root.
If B: write a short product brief for the publisher side, decide the one
immediate publisher use case to invest in, and build that one properly before
touching anything else.

### Phase 5 — Razorpay reconciliation (after Puneet confirms Razorpay approval)
- Signed Razorpay webhook endpoint `/api/webhooks/razorpay`.
- Nightly cron that scans `Payment` rows with `status=Pending` older than one
  hour, asks Razorpay for the real status, settles.
- Receipt + confirmation email on successful reconciliation.

## 6. What this plan does NOT propose
- No rewrite. The code works; it has users.
- No framework change (React/Vite/Express stay).
- No AI rewriting the live product in one go.
- No sudden switch of the reader-side revenue to self-serve. That is Puneet's
  commercial call, and the manual-approval team flow is intentional until
  Razorpay reconciliation is live.

## 7. Open questions for Puneet
1. **A or B?** (reader-focused paywall vs full publisher platform)
2. If A, is the publisher-side data (Publisher/Journal/Article/Book/Chapter)
   staying in the same DB, or being archived to its own?
3. The nested `digital-Library-Manish/` folder inside the repo — is that a
   historical AI-Studio export or something still being used? Safe to delete?
4. For the institution flow, should we add a "Request subscription" option
   alongside "Proceed to Payment" (so a librarian who prefers an invoice route
   can still get in without Razorpay)?
5. The 230k scraped items — any licence audit before this scales? The data
   value depends on being allowed to serve what has been collected.
