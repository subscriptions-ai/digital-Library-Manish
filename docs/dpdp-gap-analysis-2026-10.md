# STM Digital Library — DPDP Gap Analysis

Date: 2026-10-07 · Scope: read-only audit of the repo (server.ts, prisma/schema.prisma, src/). No code was changed.
Status: engineering audit, **not legal advice**. Items marked `TODO: DPDP_COMPLIANCE_CHECK` need counsel.

Line references are to `server.ts` unless a file is named. Findings marked ✔ were re-read by hand after the audit; the rest come from the audit passes and should be re-checked as each item is fixed.

## 0. Headline

1. **The privacy stack does not exist yet.** There is no consent record, no purpose model, no retention job, no rights API, no grievance route, no audit log and no breach process. The only consent today is two client-side tickboxes at signup that the server never receives.
2. **Several findings are plain security defects**, independent of DPDP, and are the most likely route to a reportable breach (section 16, "Fix first").
3. **The published Privacy Policy makes claims the code does not back**: cookies, at-rest encryption, 5-year retention, "all data permanently deleted", and legal bases borrowed from GDPR. Publishing inaccurate claims is itself a risk.
4. **Sales and marketing are built on signup data.** Every signup creates a CRM Lead and becomes a target for lifecycle email, and the phone number is mandatory. This is the biggest structural change the spec requires.

On timing: the DPDP Rules, 2025 phase in, with the Board provisions first and most Data Fiduciary duties later. Do not state a future obligation as already in force in UI copy. `TODO: DPDP_COMPLIANCE_CHECK` — confirm the exact commencement dates before wording any notice.

---

## 1. Personal-data fields stored

| Area | Models (schema line) | Personal data |
|---|---|---|
| Account | User (434) | email, bcrypt hash, name, organisation, phone, whatsapp, designation, registrantType, state, country, interestedDomains, institutionProfile JSON (phone/address/city/website), signupSource/signupTags (UTM, landing path), lastLoginAt, lastReadAt, marketingOptOut, unsubscribeToken |
| Sessions | UserSession (581) | IP, user agent, device label |
| OTP | EmailVerification (1184) | email, **plaintext OTP** |
| Sales | Lead (1007), LeadInteraction (1038), DemoRequest (1085), ContactInquiry (986), AgencyInquiry (969) | name, email, phone, whatsapp, designation, organisation, state; notes copy WhatsApp and designation |
| Commercial | Quotation (686), Receipt (733), Payment (597), Subscription (624), SubscriptionRequest (665), CouponUsage (1070) | name, email, mobile, address, pincode, GSTIN, items JSON, Razorpay ids |
| Behaviour | PageVisit (1194), LibraryEvent (1575), ReadEvent (166), StudentActivity (922), FreeSession (1701), Favorite (1165), UsageLog (862) | IP + city/country, UA, userId, search query text, reading time/pages, favourites |
| Email | EmailSend (1325), EmailLog (1360) | email, opens/clicks, **full HTML of every email sent** (includes OTPs and temporary passwords) |
| Other | Feedback (612), TakedownRequest (1402), PublisherContact (91), PublisherAgreement (110), PublisherMessage (151) | name, email, phone, signature, IP, UA |

No date-of-birth, age or photo field exists. Author/OpenAlex data is public bibliographic data.

## 2. Where each field is collected

| Flow | Frontend → endpoint |
|---|---|
| Signup | Signup.tsx → `POST /api/auth/signup` (856) |
| OTP | EmailVerificationInput.tsx → `/api/verify/*` (688, 744) |
| Contact | ContactUs.tsx:218 → `/api/contact` (11451) → ContactInquiry **and** Lead |
| Demo / agency / domain request | No public form found; endpoints exist and are unauthenticated (11106, 14198, 6741) |
| Pro application | ProMembership.tsx → `/api/me/pro-application` (1177); overwrites User organisation/contact/designation |
| Checkout | solo/SoloPurchase.tsx, institution pricing → 1440/1459, 12866–12936 |
| Quotation | QuotationBuilder.tsx (staff-facing) → 12037, 12050, 6851 |
| Institution members | InstitutionStudentManager.tsx → 13029 (single), 13090 (bulk) |
| Admin-created users | UserCreationPanel.tsx → 6176 |
| Analytics | AnalyticsTracker.tsx (mounted unconditionally, App.tsx:184) → `/api/analytics/track` (14448) |
| Library events | server-side on search/view (4585, 4643, 4667) |
| Takedown, feedback, publisher e-sign | ContentRemoval.tsx, FeedbackWidget.tsx, publisher dashboard |

Not found: sales-callback endpoint, newsletter form, nomination, grievance, any date-of-birth input.

### Signup field necessity (spec section 3)

| Field | Mandatory today | Needed to create the account? |
|---|---|---|
| Email | yes (OTP-verified) | **Yes** (login id) |
| Password | yes; **no server length/complexity check** | **Yes** |
| Full name | yes | Weak (display only) |
| Registrant type | yes | Only to set role/institution |
| Organisation | yes for Institute/Corporate | Only for librarian accounts |
| Designation | yes | **No** (sales/analytics; free text goes to Lead.notes) |
| Country, State | yes | **No** (sales segmentation) |
| **Mobile** | **yes**, format-checked client-side only | **No.** Used for Lead.phone and sales outreach |
| WhatsApp | optional tick, **unticked** ✔ | Optional; wording gives no purpose; stored as the number, not as a consent |
| Departments of interest | yes, at least one | **No** |
| Terms + Privacy ticks | yes, client-side only | Not sent to or stored by the server |

## 3. Current processing purposes (as built, versus as disclosed)

Built: account and access; institution seat management; payments and receipts; sales CRM (a Lead for every signup); lifecycle marketing email; usage analytics and institution dashboards; first-party site analytics; campaign attribution; AI metadata classification.
Disclosed in the policy: account management, content access, "analyzing user behavior", support. **Marketing, CRM profiling, attribution, institution visibility of reading activity and AI use are not disclosed.**

## 4. Consent mechanisms today

- **Signup ticks** (Signup.tsx:712–731): separate Terms and Privacy boxes, unticked by default (good). The Privacy box says it covers collection, processing and storage "in compliance with GDPR and DPDP Act". It is one bundled consent, it is **client-side only**, and there is no timestamp, notice version, language or source stored anywhere.
- **Cookie banner** (CookieConsent.tsx): stores a choice in localStorage only, never sends it to the server, gates nothing, and cannot be reopened. Its text says "Accept All" is consent "in accordance with the DPDP Act". `AnalyticsTracker` runs on every route, including after "Reject All", and the server stores IP, city, country and UA (14448–14474).
- **`marketingOptOut`** defaults to `false` ✔ (schema:459). Marketing is opt-out, not opt-in.
- Everything else (contact form, pro application, checkout, feedback, takedown, institution-added members): no notice and no consent.

## 5. Marketing and WhatsApp

- Engine: 7 automatic lifecycle mails plus 2 manual (`profile-incomplete`, `never-read`, `librarian-add-users`, `verify-email-reminder`, `never-logged-in`, `no-research-activity`, `inactive-user`; manual `pro-benefits`, `new-features`). All go through `sendMarketingEmail`, which does check `marketingOptOut`, blocked status, a frequency cap (5-day gap, 4/month) and re-checks opt-out after claiming the send. The engine is **off by default** (`EmailEngine.enabled`). Once enabled, every self-registered user is a target with no prior opt-in.
- `verify-email-reminder` is a service message but goes through the marketing path, so an opted-out user is never reminded.
- Welcome email (1038) is sent to everyone, contains an "Apply for Pro" upsell and has no unsubscribe link.
- Unsubscribe: tokenised link only. The token is permanent and never rotated, GET returns the email address, no timestamp/source is recorded, no `List-Unsubscribe` header.
- **WhatsApp:** no sending code exists (no Business API). The floating button is a static `wa.me` link carrying no user data. But numbers are collected in four places (signup, Contact Us, demo, trial). Only signup has a tick, and none records consent. Nothing stops a rep from messaging any stored number. WhatsApp numbers appear in admin CSV export, contact views and Lead notes.
- Sendy is referenced only as a campaign label. Any Sendy mailing happens outside this repo and **could not be audited**.
- Attribution (`stm_attribution`, 90-day localStorage, set in main.tsx before any consent) is stored on the User at signup and not disclosed.

## 6. Retention

- **No retention policy is enforced anywhere.** The only automatic deletion is expired `UserSession` rows for a user at their next login (211).
- Unbounded: PageVisit, LibraryEvent (search text), ReadEvent, StudentActivity, FreeSession, UsageLog, EmailVerification, EmailLog, EmailSend, all Lead/Contact/Demo/Agency rows, Quotation, Receipt.
- Privacy Policy promises deletion or anonymisation up to 5 years after inactivity. No job implements it.
- **Backups** (scripts/backup-db.sh): plain `pg_dump -Fc` into `./backups/`, **no encryption, no rotation, no off-site copy**, and no erasure-aware restore procedure. Dumps contain password hashes and EmailLog bodies.

## 7. Deletion and erasure

- `DELETE /api/user/account` (4994) ✔ is a bare `prisma.user.delete` with a comment "depending on cascade settings".
  - Cascades: UserSession, InstitutionMemberAccess.
  - Orphaned but still holding personal data in scalar columns: Quotation, Payment, Subscription, SubscriptionRequest, UsageLog, StudentActivity, CouponUsage, EmailSend.
  - Untouched: Receipt, FreeSession, LibraryEvent, ReadEvent, PageVisit, EmailLog, EmailVerification, **Lead, ContactInquiry, DemoRequest, AgencyInquiry** (the erased person stays in the sales CRM).
  - `Favorite`, `Feedback` and `LeadInteraction` have required FKs with no cascade, so the delete **probably fails** for anyone who has a favourite or left feedback (inferred from schema, not run).
  - The UI then says "Your account and all personal data have been permanently deleted" (ProfileSettings.tsx:41), which is untrue.
- Admin delete (6359): deletes Payment and Quotation (conflicts with any tax-retention basis), misses Feedback, leaves Receipt and logs.
- Institution can delete a student account (13281) with the same behaviour.
- No soft-delete, tombstone, erasure queue or deletion record.

## 8. Data-principal rights

| Right | Today |
|---|---|
| Access | "Download My Data" serialises only the cached client profile (ProfileSettings.tsx:17). No server export. |
| Correction | `PUT /api/user/profile` accepts only name and password. Email, phone, organisation, state cannot be corrected by the user. |
| Silent overwrite | An institution admin can change a member's email, contact and password (13228) with no notice or re-verification. The Pro application overwrites User organisation/contact/designation. |
| Erasure | See section 7. |
| Withdraw consent | Marketing: email link only. WhatsApp, cookies: none. |
| Grievance | None. Complaints land in ContactInquiry + Lead (the sales CRM). |
| Nomination | None. |
| `/api/privacy/*` | None. |

The footer and policy show only the generic `info@celnet.in` (an old-entity domain; the in-app T&C names IT Break COM Pvt. Ltd.). No named privacy contact, no response time, no Board reference.

## 9. Children

No age or date-of-birth field, no age gate, no parental consent, no mention of minors in the policy or T&C. `role = Student` is **not** an age signal (institution-added members all get it, including faculty). Schools are a stated institution type (constants.ts, server.ts:9948), and Solo signup is open to anyone. Behavioural tracking (PageVisit, LibraryEvent, lifecycle journeys) applies to every user, which s.9 prohibits for children. A product strategy decision is needed (section 18).

## 10. Processors and integrations

| Service | Data | Region / note |
|---|---|---|
| AWS SES | recipient, name, full email bodies | Code default `ap-south-1`, but `settings.json` says **`eu-west-1`**, and the dynamic path is the one used for real sends. Effective region must be confirmed. |
| Ethereal (dev SMTP) | all mail | Silent fallback when AWS keys are absent (313). Must never happen in production. |
| Razorpay | server: amount/receipt; browser: prefill name, email, phone | India. Signature verified server-side. |
| Gemini, OpenRouter | see section 11 | Outside India |
| Google Fonts, jsDelivr, Unsplash, picsum | visitor IP/UA leaks on page load, no consent gate | Outside India |
| Cloudflare | IP and geo headers read at 14452 | In front of the app |
| Coolify host, Postgres, file store | unknown | Region and provider undocumented |
| Firebase | dependency + blueprint only, not used at runtime | Remove |
| Sendy | unknown | Outside repo |

No processor registry, no DPA record, no sub-processor list. The policy names no vendor. `@aws-sdk/client-s3` is a build dependency but unused; uploads are written to the local `uploads/` folder.

## 11. AI / LLM data flows

- **Gemini classifier** (aiClassifier.ts): prompt is public article metadata only (title, authors, description). **`classifyContent` is imported but never called** — dead code.
- **OpenRouter curation** (aiAgent.ts, admin-triggered): payload is OpenAlex titles and 300-char abstracts, via a **free-tier third-party model** whose logging/training terms are unknown (assumption, not verified).
- **No user personal data, user queries or uploaded documents reach any LLM today.** That is the good news, and it should be protected by a guard before any "AI Extractor" accepts user uploads. No AI register, masking layer or human review exists, and the policy does not mention AI.

## 12. Admin and sales access to personal data

- No audit/access log exists. Listing and **CSV-exporting all members with phone and WhatsApp** (5411–5500) writes nothing.
- ✔ `GET /api/admin/quotations` uses `include: { user: true }` and returns the **bcrypt hash** and every User field.
- ✔ `GET /api/institution/students` has no `select`: a librarian receives every student's full User row **including password hash**, contact details and full per-student reading history. `/api/institution/stats` and `/analytics` also send raw `user` objects.
- ✔ `GET /api/admin/verifications` returns `EmailVerification` rows including live OTPs to SuperAdmin and SubscriptionManager. Combined with the password-reset flow, that is an account-takeover primitive.
- **Sales scoping is UI-only on several routes.** `/api/sales/my-leads` filters by `assignedToId`, but ✔ `GET /api/sales/leads/:id`, `PUT .../status` and `POST .../interactions` check only the role, so any sales user can read or edit any lead by id. `/api/sales/pro-applications` returns up to 200 members to any sales user. ✔ `GET /api/quotation/customer/:email` returns any customer's latest quotation to any sales user.
- Every signup is filed as a Lead, so "Sales sees only assigned leads" still means the CRM mirrors the entire membership.
- No separation of SERVICE USER from SALES LEAD.

## 13. Institution analytics

Librarians receive per-person data by default: `topReaders` with names, a `silent` list of non-readers with last-seen, per-student reading time and full activity history. No minimum group size or aggregate-only mode. Members are told nothing; institution-added students never see any notice (and receive no email at all on the single/bulk add routes, though marketing can reach them later). The platform/institution roles (fiduciary vs processor) are undefined in code, policy and contract.

## 14. Security logging and safeguards

- **Good:** bcrypt hashing; JWT with server-side session row checked every request; single-device login with advisory lock; helmet; login rate-limit; `.env` ignored; production refuses a missing JWT secret.
- **Weak:**
  - Tokens in `localStorage`, and `authenticateJWT` also accepts `?token=` in the URL (262).
  - Helmet CSP disabled; no HSTS in code (left to the proxy).
  - OTPs: plaintext in DB ✔, `Math.random()`, `!==` compare, **no attempt limit** on verify/reset, and **logged to stdout in production** with email ✔ (727–735).
  - Password reset does not revoke existing sessions.
  - Admin-created/reset passwords are emailed in plaintext, returned in the reset JSON response, and kept in `EmailLog`.
  - Master-admin password via env with plain `===` compare; `seed-admin.ts` hard-codes an admin password.
  - `/api/admin/settings` (3445) may return the raw SES secret.
  - `settings.json` (tracked ✔) holds AWS key fields; currently empty, but history was **not** fully scanned.
  - `server_log.txt` is tracked ✔ (no personal data seen).
  - No password complexity check on signup.
- No failed-login recording, no admin-action audit, no access monitoring. Logs go to stdout only. `UsageLog` records some admin mutations.

## 15. Breach workflow

Nothing exists: no incident model, no runbook, no contact tree, no Board/Principal notification templates, no alerting. The only evidence-preservation source is stdout and EmailLog.

---

## 16. Gaps by severity

### Critical — fix first (security defects; independent of DPDP)
| # | Gap | Where |
|---|---|---|
| C1 | Password hashes returned to librarians and admins | 13019, 6890, 12368 |
| C2 | OTP plaintext, console-logged in prod, readable via admin API, no attempt limit | 705, 732, 754, 14626 |
| C3 | Sales IDOR on leads and quotations | 15047–15094, 11904 |
| C4 | `/uploads` served publicly with no auth, no type filter, any logged-in user can upload (incl. publisher agreement documents) | 7657, 7668 |
| C5 | Unauthenticated `POST /api/invoice/send` (open mail relay) and `POST /api/admin/subscription-requests` | 12339, 10964 |
| C6 | Self/admin/institution account deletion broken or incomplete, and UI claims full erasure | 4994, 6359, 13281 |
| C7 | Unencrypted, unrotated backups | scripts/backup-db.sh |

### High — core DPDP architecture
| # | Gap |
|---|---|
| H1 | No consent evidence (no ConsentArtifact, notice version, language); signup ticks never reach the server |
| H2 | No processing basis or purpose model; signup creates Leads and marketing targets without a basis |
| H3 | Mobile, state, country, designation and interests mandatory without necessity |
| H4 | Marketing is opt-out; lifecycle email once enabled hits everyone; policy doesn't disclose it |
| H5 | Cookie banner is cosmetic; analytics and attribution run regardless; "Accept All" copy asserts DPDP consent |
| H6 | No rights API/UI: access, correction, erasure, nomination, grievance; "download" is a stub |
| H7 | No retention engine; no purge for any table; policy promises a 5-year rule that nothing enforces |
| H8 | No grievance mechanism or privacy contact; complaints enter the sales CRM |
| H9 | Policy is inaccurate (cookies, encryption at rest, deletion, GDPR bases, "legitimate interests", deemed consent by continued use, no DPDP content, entity mismatch with docx) |
| H10 | No audit log for admin access/export of personal data |
| H11 | No breach workflow |
| H12 | Institution-added members receive no notice; fiduciary/processor roles undefined |
| H13 | Librarians see individual reading history without disclosure |
| H14 | Erased users persist in Lead, ContactInquiry, DemoRequest, EmailLog, PageVisit, backups |

### Medium
Processor registry and DPAs missing; SES region inconsistent and possible Ethereal fallback; third-party CDN/font calls leak IP; token in localStorage and `?token=` accepted; password reset keeps sessions; no complexity check; EmailLog stores full bodies; unsubscribe token permanent, no `List-Unsubscribe`; welcome mail has upsell; `verify-email-reminder` classified as marketing; no children strategy; AI register and LLM guardrails absent; OpenRouter free model; no k-anonymity in analytics; email-address change flow absent; settings.json/secret history unverified.

### Low
Dead code (`classifyContent`, `usageTracker.ts` calls a nonexistent endpoint, Firebase dependency, unused S3 dependency); `server_log.txt` and `*.txt` ignore pattern; Privacy Policy cites "GDPR" heading; no policy version number; cookie banner has no reopen link; Hindi/regional notice impossible under the `check:english` guard (see decision 4).

---

## 17. Implementation plan

Mapped to the spec's 10 phases, with a Phase 0 added. Each phase ships behind small PRs, with a localhost browser check before deploy (your standing rule).

**Phase 0 — Security hotfixes (C1–C7). No product behaviour changes.**
Strip hashes with explicit `select`s; hash OTPs, use `crypto.randomInt`, add attempt limits, remove console OTP log and stop returning OTPs in admin; enforce `assignedToId`/`createdBy` server-side on sales routes; auth + type/size allowlist on uploads and move private documents to an authenticated route; auth on `invoice/send` and `subscription-requests`; make deletion a transaction with a proper cascade list; encrypt and rotate backups. Add `select`-based DTOs so this class of leak can't recur.

**Phase 1 — Data inventory and purpose map.** Turn sections 1–3 into a checked-in `DataPurpose` seed and a CI check that new User/Lead columns need a purpose. Decide Lead vs service-user model.

**Phase 2 — Consent / processing-basis architecture.**
New tables: `DataPurpose`, `ConsentArtifact` (append-only), `ConsentEvent`, `RetentionPolicy`, `AuditEvent`. A `PrivacyPolicyEngine.authorize({user, purpose, dataCategories, basis})` service, fail-closed. Wrap `sendMarketingEmail`, WhatsApp use, Lead creation and analytics writes. Jurisdiction layer (`INDIA_DPDP | EU_GDPR | UK_GDPR | OTHER`) resolved from country, with the strictest defaults for non-India.

**Phase 3 — Notices and signup.** Standalone notice components (data, purpose, enabled service, withdraw link, rights link, grievance link) at each collection point; separate unticked marketing and WhatsApp consents with purpose wording; mobile and other non-necessary fields become optional; server stores consent evidence; cookie banner made real (gates analytics and attribution), with a reopen link. Backfill existing users with `LEGACY_UNKNOWN` status and **no marketing until re-consented** (decision 2).

**Phase 4 — Privacy Center and rights APIs.** Settings → Privacy & Consent, and Privacy & Data Rights; the `/api/privacy/*` routes in the spec; real export; verified-field change flow with re-verification; nomination; grievance ticket model separate from the CRM; Admin Privacy Center with aggregate counts only.

**Phase 5 — Retention and erasure.** Policy table per category (SECURITY_LOG, TRANSACTION_LOG, CONSENT_LOG, ACCOUNT_DATA, MARKETING_DATA), a scheduled job, an `ErasureRequest` workflow that anonymises rather than hard-deletes where tax/contract needs it, a deletion tombstone with no personal data, and a backup-restore replay rule. `TODO: DPDP_COMPLIANCE_CHECK` — confirm statutory retention periods (including the log-retention requirement in the Rules) and GST/accounting periods.

**Phase 6 — Security and processors.** ProcessorRegistry seeded from section 10; fix SES region; remove Ethereal fallback in production; self-host fonts and map data; CSP and HSTS; token handling; session revocation on reset; secret-history scan.

**Phase 7 — Children.** Implement the strategy chosen in decision 1.

**Phase 8 — AI controls.** AI Processing Register; an outbound-LLM guard (PII detector and allowlist) before any user-supplied content can be sent; remove dead classifier or document it; replace the free OpenRouter model or record its terms.

**Phase 9 — Breach workflow.** `BreachIncident` model, Admin screen, notification templates, timers (do not wait for 72 hours for the initial Board intimation), evidence capture.

**Phase 10 — Compliance QA.** End-to-end consent and withdrawal tests, rights-request tests, retention dry-run, access-control tests on every personal-data route, policy-text-versus-code review, then counsel review.

## 18. Decisions needed before Phase 2

1. **Children:** Option A (adults / institution-administered only; add a signup declaration and Terms clause, restrict Solo) or Option B (full parental-consent flow). Recommendation: **A**, since it is far cheaper and the product is academic. Schools remain possible only as institution-administered accounts, which need their own treatment. `TODO: DPDP_COMPLIANCE_CHECK`
2. **Existing users and marketing:** with consent not recorded, the safe default is no marketing to anyone until they opt in. That also means the lifecycle engine stays off until opt-in is built. Confirm.
3. **Leads on signup:** stop auto-creating Leads for service users; create a Lead only on an explicit sales contact (demo, contact, quotation, pro application). Confirm.
4. **Language:** the `check:english` guard and your English-only decision conflict with the spec's language-access requirement. Proposal: build translatable notice templates and store `notice_language`, ship English only, and exempt only a reviewed notices folder from the guard when translations are added.
5. **Privacy contact:** name, role and a dedicated address (not `info@celnet.in`), and confirm which legal entity (IT Break COM Pvt. Ltd. vs the old Consortium e-Learning Network) is the Data Fiduciary.
6. **Hosting facts I could not find:** region of the Coolify host and Postgres, the Sendy host, the effective SES region, and whether the OpenRouter and Gemini keys are paid tier.
7. **Institution role:** is the institution the fiduciary for its roster with the platform as processor, or are both fiduciaries? This sets the notice, DPA and the analytics visibility defaults.
8. **Significant Data Fiduciary:** assume **no** until notified; the architecture will leave hooks.

## 19. Not audited

Sendy and any external mailing lists; production DB contents (counts, orphan rows); Coolify/infra configuration; full git history for secrets; every admin endpoint field-by-field (payments, email-logs, contact-inquiries, demo-requests); whether the app deletes work as inferred (not executed); email template bodies for promotional text.
