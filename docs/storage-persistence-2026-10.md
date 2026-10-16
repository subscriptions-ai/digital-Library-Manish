# Uploaded images must survive a deploy — blog covers and every other upload

Written 2026-10-16 after blog covers appeared to "revert" after a redeploy.

## What happens

1. An editor uploads a cover in Studio. `POST /api/studio/cover` writes the file to
   `<UPLOAD_DIR>/media/<timestamp>-<random>-cover.<ext>` and stores its address, `/uploads/media/<name>`,
   in `BlogPost.coverUrl` (and a `MediaAsset` row). The address is relative; the app serves it from the same directory.
2. `UPLOAD_DIR` is `process.env.UPLOAD_DIR`, else `<app directory>/uploads`. In the production image the app lives in
   `/app`, so uploads go to **`/app/uploads` — inside the container**.
3. Coolify replaces the container on every deploy. Anything written inside the old container is not in the new one.
   The database is separate and survives, so the post still points at `/uploads/media/<name>` and the file is gone.
4. The public page cannot load that address. It used to fall back to one of five pieces of artwork that ship inside the
   image (`public/assets/blog/*.webp`, made once with an image tool; the prompts are in `generation-prompts.json`). That is the
   "AI-generated image coming back": nothing generated anything, and nothing was written to the post.

The application does not create, replace or rewrite blog covers on its own. Only an editor's save changes `coverUrl`.

## The fix on the server (Coolify) — required

Add a **persistent volume** to the application:

| Coolify → Application → Persistent Storage | |
|---|---|
| Name | `stm-uploads` |
| Destination path (inside the container) | `/app/uploads` |

The Dockerfile now sets `UPLOAD_DIR=/app/uploads` explicitly, so this is the one path to mount. If you prefer another path, set
`UPLOAD_DIR` to it in the application's environment **and** mount the volume there.

The volume survives deploys, redeploys, rolling replacement and restarts.

Do this before the next deploy, and copy the current files out first — the container you are running now still has them:

```
docker ps | grep <app>                     # find the running container
docker cp <container>:/app/uploads ./uploads-backup
```

After mounting the (empty) volume and redeploying, copy the backup into it (`docker cp ./uploads-backup/. <container>:/app/uploads/`).

### How to confirm it worked

`GET /api/admin/media/health` (editors and admins) reports `uploadDir`, `separateMount`, how many uploaded files are missing,
and `storage.resets` — the number of times the app found the uploads folder replaced. After mounting the volume, redeploy
once more: `resets` must not increase and `filesMissing` must be 0. Studio's Posts page shows a warning while any file is missing.

## Longer term: object storage

The code already isolates the write (`saveDataUrl`, `/api/studio/cover`, `/api/admin/media`) and stores a URL, so an S3-compatible
store (Cloudflare R2 or AWS S3) is a small change: write the object, store its permanent public URL on the post.
Recommended for Blog covers, the Media Library and publisher uploads. Keep the unique-filename rule (`blog/<post-id>/<uuid>.webp`),
which also makes the files safe to cache forever.

Migration plan (separate from this fix; not done automatically):

1. Create the bucket and a public-read prefix (or a CDN in front); add credentials to Coolify only.
2. Add a storage module with `put(key, bytes, mime) → url`; switch the three upload routes to it behind a flag.
3. Copy existing files from the volume to the bucket, keeping each name; add a `MediaAsset.url` rewrite per row **after** the object is verified.
4. Update `BlogPost.coverUrl` / `ogImage` rows that point at `/uploads/media/<name>` to the new URL in one reviewed script, with a dry run and a backup.
5. Keep serving `/uploads` from the volume for a release, then remove it.
