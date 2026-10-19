# Media storage on a Coolify persistent volume (interim, 2026-10-19)

Blog covers and Media Library files are stored on disk under `/app/uploads` and served at `/uploads/...`. The container filesystem is
replaced on every deploy, so `/app/uploads` must be a persistent volume. AWS S3 is the later, final architecture; it is not needed now.

## Paths (verified in code)

| | |
|---|---|
| Working directory in the container | `/app` (Dockerfile `WORKDIR /app`) |
| Storage root | `MEDIA_STORAGE_ROOT`, else `UPLOAD_DIR`, else `<cwd>/uploads` → `/app/uploads` |
| Media directory | `/app/uploads/media` |
| Public URL → file | `/uploads/<path>` → `/app/uploads/<path>` (Express static; anything outside the root is never served) |
| Also under the root | `/app/uploads/covers` (book-cover cache, refetchable), publisher uploads in `/app/uploads`, `.storage-id` (the storage check's marker) |

## Before mounting the volume — save what the current container holds

Mounting a volume over `/app/uploads` hides the files the running container wrote there. Inside the **current** container (Coolify → Terminal):

    node scripts/media-inventory.cjs          # read-only: existing, missing, referenced, unreferenced
    node scripts/media-inventory.cjs --json > /tmp/media-inventory.json

Then on the Coolify host:

    docker ps | grep <app>                                    # the running container's id
    docker cp <container>:/app/uploads ./uploads-backup-$(date +%F)
    docker cp <container>:/tmp/media-inventory.json ./uploads-backup-$(date +%F)/

After the volume is mounted and the new container is running, copy the backup in:

    docker cp ./uploads-backup-<date>/. <new-container>:/app/uploads/

## Coolify settings

**Persistent Storage** (Application → Persistent Storage → Add):

| Field | Value |
|---|---|
| Type | Volume |
| Name | `stm-digital-library-uploads` |
| Destination path | `/app/uploads` |

Mount the parent `/app/uploads` only — not `/app/uploads/media` separately.

**Environment variables:**

    MEDIA_STORAGE_DRIVER=local-persistent
    MEDIA_STORAGE_ROOT=/app/uploads

`AWS_S3_BUCKET` is not needed. Leave the existing AWS credentials alone (they are used for email). If `AWS_S3_BUCKET` is set while the driver
is `local-persistent`, the driver wins.

## What the app does

- **Production with no driver and no S3:** uploads are refused (503) with a message saying what to set. Nothing is written to a temporary
  folder. The Studio shows "Media storage: Not configured — uploads are paused".
- **Persistent volume, writable:** Studio shows "Media storage: Persistent volume · Healthy". Each upload gets a new `<uuid>.<ext>` name, is
  written and size-checked, and only then is the record created; the post's cover changes only when the editor saves.
- **Persistent volume, not writable:** uploads are refused with "The persistent media volume at /app/uploads is not writable…", nothing in the
  database changes, existing images keep being served.
- **A cover whose file is gone:** the post and its saved address are kept; Studio says "Cover image unavailable — replace image"; readers see
  a neutral branded panel (logo on navy), never a fabricated image. Uploading a replacement gives a new address, so no cached 404 sticks.
- `GET /api/admin/media/health` reports the driver, whether the directory exists and is writable, and `storage.resets` (how many times the
  directory was found replaced). After the first deploy with the volume, `resets` must stay the same on every later deploy.

## Later: S3

Set `MEDIA_STORAGE_DRIVER=s3` with `AWS_S3_BUCKET` (and optionally `AWS_S3_PUBLIC_BASE_URL`). The editor and Studio do not change: every upload
goes through `uploadMedia()` in `src/server/storage/mediaStorage.ts`. Existing `/uploads/...` files would need a one-off copy to the bucket.

## Tests

- `scripts/test-media-storage.ts` (43): production fail-safe, persistent-local upload, refresh, restart, redeploy on the same volume, replace,
  manual-cover protection, legacy missing cover, read-only volume.
- `scripts/test-blog-cover-persistence.ts` (35), `scripts/test-blog-seo.ts` (107).
