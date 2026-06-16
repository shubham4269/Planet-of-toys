# Admin Media Library — Design Specification

> **Status:** Approved design, pending final spec review before the TDD plan.
> **Scope:** An admin-only Media Library to manage files in `server/media` without VPS access:
> list/search/preview/open/download/copy-URL/delete, file size + upload date, total-storage
> summary card, Image/Video filter, and an "Unused Media" filter. Filesystem-derived (no new
> model), local storage only (no Cloudflare/R2). Architecture left ready for future bulk-delete
> and garbage collection.

## 1. Architecture

Extend the existing **`media` module** with read/manage capabilities. The filesystem
(`server/media`, via `getMediaDir()`) is the source of truth — no DB model, no backfill, works on
existing files immediately. A single **referenced-media collector** powers both the "Unused"
filter and the block-in-use delete guard, and is the reusable primitive for a future GC and
bulk-delete. Admin UI lives under **Content → Media Library**. No storefront component.

## 2. Server — `media` module additions

```
server/src/modules/media/
  mediaLibrary.service.js   (new)
  media.controller.js       (extend: list, delete)
  media admin router        (extend: GET "/", DELETE "/:filename")
```

**`mediaLibrary.service.js`:**
- `collectReferencedMedia()` → `Set<filename>` gathered (projected queries) from:
  Product `images`, `video`, `variants.images`; Category `image`, `heroImage`;
  Collection `heroImage`; NavigationItem `image`; HeroSlide `desktopMedia`, `mobileMedia`,
  `video`, `posterImage`. Values normalized to bare basenames. **Explicit list** — over-inclusion
  is safe; under-inclusion is the only risk, so adding a new media field means adding it here.
- `isReferenced(filename, refSet)` → boolean (shared by list, delete, and future bulk/GC).
- `listMedia({ q, type, filter })` → reads `server/media` (skips `.gitkeep`/dotfiles), `fs.stat`
  each file; builds items `{ filename, url:"/api/media/<f>", size, sizeLabel, modifiedAt,
  kind: "image"|"video", inUse }`. Applies: `q` (filename substring, case-insensitive),
  `type` (`all|image|video` by extension), `filter` (`all|unused` → keep `!inUse`). Sorted
  newest-first. Returns `{ items, summary }`.
- `summarize(allItems)` → `{ totalFiles, totalBytes, totalLabel, imageCount, videoCount,
  unusedFiles, unusedBytes, unusedLabel }` (computed over the **full** set, independent of the
  active filters, so the summary card is stable).
- `deleteMedia(filename)` → **path-traversal guard** (must equal `path.basename(filename)`, no
  `/`, `\`, or `..`); if `isReferenced` → throw `MediaLibraryError(409, usedBy)` where `usedBy`
  lists `{ type, id, label }` of referencing entities; else `fs.unlink` in `getMediaDir()`.
- Helpers exported for future reuse: `referencingEntities(filename)` (used by the 409 payload),
  and the design keeps `deleteMedia` a thin guarded wrapper so a future
  `bulkDelete(filenames[])` / GC `sweepUnused()` can reuse `collectReferencedMedia` + the same
  unlink path.

`kind` by extension: image = `.webp/.jpg/.jpeg/.png/.gif/.avif/.tiff`; video = `.mp4/.webm/.mov`.
`sizeLabel` = human-readable (KB/MB).

## 3. API contracts

```
GET    /api/admin/media?q=&type=all|image|video&filter=all|unused   (auth)
       → { items: [ { filename,url,size,sizeLabel,modifiedAt,kind,inUse } ], summary }
POST   /api/admin/media                       (existing upload — unchanged)
DELETE /api/admin/media/:filename             (auth)
       → 200 { deleted: true } | 409 { error: { message, status }, usedBy: [{type,id,label}] }
```
All on the existing `/api/admin/media` admin mount, behind `requireAuth`. (Public serving stays
at `GET /api/media/:filename`, unchanged.)

**Future-ready (designed, not built now):** a `POST /api/admin/media/bulk-delete { filenames }`
and a GC sweep are natural additions — both reuse `collectReferencedMedia` + `isReferenced`.

## 4. Admin page — Content → Media Library

- **Storage summary card** (top): total files, **total storage used** (e.g. "14.2 MB"), image vs
  video counts, and unused count/size — from `summary`.
- **Toolbar:** search box (`q`); **type filter** All / Images / Videos; **usage filter** All /
  Unused; an **Upload** control (reuses `POST /api/admin/media` → refresh).
- **Media grid** — one card per item:
  - Thumbnail preview (`<img>` / muted `<video>`).
  - Filename · **size** · **upload date** · **In use / Unused** badge.
  - Buttons (all on the brand system): **Open/Preview** (opens the full media URL in a new tab),
    **Download** (client-side `fetch`→blob→`a[download]`, so cross-origin downloads work),
    **Copy URL** (copies the absolute `mediaUrl(filename)`), **Delete** (blocked for in-use →
    surfaces the 409 "used by …" message; allowed for unused).
- Reuses `mediaUrl`, `API_BASE_URL`, and the corrected upload pattern (`${API_BASE_URL}/api/admin/media`,
  reading `data.media.filename`).

## 5. Performance / safety

- Reference set computed once per list request (handful of projected queries) and reused for every
  item's `inUse` flag and the summary — no N+1.
- Delete guarded against path traversal and against removing referenced (live) assets.
- Files remain in `server/media`; no external storage.

## 6. Testing

- `mediaLibrary.service`: list returns size/kind/modifiedAt; `q`/`type`/`filter` filtering;
  summary totals (files, bytes, image/video, unused); `inUse` reflects references; `deleteMedia`
  unlinks an unused file; `deleteMedia` throws 409 with `usedBy` for a referenced file; traversal
  guard rejects `../` / nested paths.
- admin router: `GET` requires auth + returns items+summary; `DELETE` unused → 200; `DELETE`
  in-use → 409.
- admin page: loads grid + summary card; search filters; type filter; unused filter; Copy URL;
  Delete (unused) removes the card; in-use Delete shows the blocked message.

---

## Architecture Self-Review

1. **Placeholders:** none. Bulk-delete/GC are explicitly *designed-for, not built* — the reusable
   `collectReferencedMedia`/`isReferenced`/guarded-unlink primitives are the readiness.
2. **Consistency:** one reference set drives Unused filter, `inUse` badges, and delete guard;
   filesystem is the single source of truth across list/summary/delete.
3. **Scope:** media module + one admin page; no new model, no storefront, no external storage; no
   change to checkout/orders/payments/auth.
4. **Ambiguity resolved:** two independent filters (type + usage); DELETE param is basename-only;
   summary computed over the full set (filter-independent); download is client blob-based for
   cross-origin reliability.

## Remaining Scalability Concerns (and mitigations)

1. **Large media dirs:** `readdir + stat` is fine for hundreds of files; if it grows to thousands,
   add pagination to `listMedia` (the response shape already nests `items`, so paging is additive).
2. **Reference scan cost:** projected queries over a few collections; cache or index later if
   needed — no schema change required.
3. **Bulk-delete / GC:** reuse `collectReferencedMedia` + `isReferenced`; a sweep should honour a
   grace window (skip files modified in the last N hours) to avoid reaping in-flight uploads.
