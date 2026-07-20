# Deploy Notes — Publisher Module & Structured Dataset (Phase 3)

These changes are **additive** — new Prisma tables (`Publisher`, `Journal`, `Article`,
`Book`, `Chapter`), new API routes, new UI, and a settings flag. **No existing table,
column, or route was removed or renamed**, so current data and current users are unaffected.

## ⚠️ Important: production `npm start` runs `prisma db push --accept-data-loss`
For these additive changes that is safe (it only *adds* the new tables). But the
`--accept-data-loss` flag will silently drop data if a future schema change *removes* or
*renames* a column. **Rule: never drop/rename an existing column in a deploy.**

## Safe deploy checklist (run in order)

1. **Back up the production database first** (non-negotiable — this is the rollback insurance):
   ```bash
   pg_dump "$DATABASE_URL" -Fc -f backup_$(date +%Y%m%d_%H%M).dump
   ```
2. **Deploy during low traffic** (night), so learners aren't affected if a restart blips.
3. Deploy as usual (Coolify build → `npm start`). The build runs
   `prisma generate && vite build && npm run build:server`; start runs
   `prisma db push` (adds the 5 new tables) then boots the compiled server.
4. **Smoke-test after deploy**: log in as admin, open one piece of content, open the
   dashboard, and check the new **Publishers**, **Content Review**, **Data Ingestion**
   tabs load. Hit `/api/health`.
5. **Rollback if needed**:
   - App: Coolify → redeploy the previous deployment.
   - DB (only if a data problem): `pg_restore -d "$DATABASE_URL" --clean backup_XXXX.dump`.

## Feature flags / safe defaults
- **Stealth Mode** (`publisherSafeMode`) defaults **OFF** — nothing changes for users until
  an admin turns it on (Admin dashboard → Stealth Mode toggle).
- **Publisher-submitted content** defaults to **Draft** — never auto-published; requires
  SuperAdmin/SubscriptionManager approval. Admin bulk ingestion publishes directly.
- The legacy scraped `Content` (Archived dataset) is untouched; the new structured data
  lives in the new tables. Users toggle Archived vs New in the library.

## What was added (for reference)
- Prisma: `Publisher`, `Journal`, `Article`, `Book`, `Chapter` models (all optional/nullable
  fields except ids/titles).
- Backend routes: `/api/admin/publishers*`, `/api/admin/review/*`, `/api/publisher/*`,
  `/api/admin/ingest/*` (preview + run), `/api/library/*` (public browse),
  `publisherSafeMode` added to `/api/public/settings` and `/api/admin/settings`.
- Frontend: admin PublisherManager, PublisherReviewQueue, DataIngestion; publisher
  PublisherLayout + PublisherDashboard; public StructuredLibrary (`/explore`); Navbar
  stealth-mode wrapping; Stealth Mode toggle on the admin dashboard.
