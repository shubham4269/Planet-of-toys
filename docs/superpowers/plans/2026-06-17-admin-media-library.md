# Admin Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a Content → Media Library page to list, search, filter (type + unused), preview, open, download, copy-URL, and delete files in `server/media`, with a storage-summary card — all without VPS access.

**Architecture:** Extend the existing `media` module with a filesystem-derived `mediaLibrary.service.js` (no DB model). A single referenced-media collector (queries Product/Category/Collection/NavigationItem/HeroSlide) powers both the "Unused" flag and the block-in-use delete guard, and is the reusable primitive for future bulk-delete/GC. New authenticated routes `GET /api/admin/media` and `DELETE /api/admin/media/:filename` are added to the existing admin media router. The admin SPA gets one new page under Content → Media Library.

**Tech Stack:** Node ESM, Express, Mongoose, vitest + mongodb-memory-server (server); React 18 + react-router-dom 6, vitest + @testing-library/react (admin). Spec: `docs/superpowers/specs/2026-06-17-admin-media-library-design.md`.

---

## File Structure

**Server (`server/src/modules/media/`):**
- `mediaLibrary.service.js` (new) — `createMediaLibraryService({ getMediaDir })` → `{ collectReferencedMedia, referencingEntities, isReferenced, listMedia, summarize, deleteMedia }`; plus exported pure helpers `toBasename`, `classifyKind`, `humanSize`; plus `MediaLibraryError`.
- `mediaLibrary.service.test.js` (new) — unit tests against mongodb-memory-server + a temp media dir.
- `media.controller.js` (modify) — add `createListHandler`, `createDeleteHandler`.
- `media.router.js` (modify) — `createMediaUploadRouter` gains `GET "/"` and `DELETE "/:filename"`; `createMediaRouters` builds + injects the library service.
- `media.router.library.test.js` (new) — router-level auth/list/delete tests.

**Server wiring:**
- `server/src/index.js` (modify) — build the media library service from the shared media service's `getMediaDir` and pass it into `createMediaRouters`.

**Admin SPA (`apps/admin/src/`):**
- `pages/admin/content/MediaLibraryPage.jsx` (new) + `pages/admin/content/MediaLibraryPage.css` (new).
- `pages/admin/content/MediaLibraryPage.test.jsx` (new).
- `App.jsx` (modify) — add `<Route path="media-library" element={<MediaLibraryPage />} />` under `content`.
- `components/AdminLayout.jsx` (modify) — add `{ to: "/admin/content/media-library", label: "Media Library" }` to the Content children.

**Key shared facts (verified in codebase):**
- Media values are stored as bare filenames (upload returns `{ media: { filename, url } }`; pages save `data?.media?.filename || data?.media?.url`). `collectReferencedMedia` normalizes every value to its basename so a stored `/api/media/x.webp` and a bare `x.webp` both match.
- Media-bearing fields: Product `images[]`, `video`, `variants[].images[]`; Category `image`, `heroImage`; Collection `heroImage`; NavigationItem `image`; HeroSlide `desktopMedia`, `mobileMedia`, `video`, `posterImage`.
- Model imports (default exports): `../products/product.model.js`, `../catalog/category.model.js`, `../catalog/collection.model.js`, `../catalog/navigationItem.model.js`, `../hero/heroSlide.model.js`.
- `media.service.js` exposes `getMediaDir()` and `DEFAULT_MEDIA_DIR`.
- Admin upload pattern: `fetch(\`${API_BASE_URL}/api/admin/media\`, { headers: { Authorization: \`Bearer ${getToken()}\` }, body: FormData })`, then read `data?.media?.filename || data?.media?.url`.

---

## Task 1: `mediaLibrary.service.js` — pure helpers + error class

**Files:**
- Create: `server/src/modules/media/mediaLibrary.service.js`
- Test: `server/src/modules/media/mediaLibrary.service.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/modules/media/mediaLibrary.service.test.js`:

```js
// server/src/modules/media/mediaLibrary.service.test.js
import { describe, it, expect } from "vitest";
import { toBasename, classifyKind, humanSize, MediaLibraryError } from "./mediaLibrary.service.js";

describe("mediaLibrary pure helpers", () => {
  it("toBasename normalizes urls, slashes, backslashes, and trims", () => {
    expect(toBasename("/api/media/abc.webp")).toBe("abc.webp");
    expect(toBasename("https://cdn.example.com/x/y/z.mp4")).toBe("z.mp4");
    expect(toBasename("folder\\nested\\v.mov")).toBe("v.mov");
    expect(toBasename("  plain.png  ")).toBe("plain.png");
    expect(toBasename("")).toBe(null);
    expect(toBasename(null)).toBe(null);
    expect(toBasename(123)).toBe(null);
  });

  it("classifyKind maps extensions to image/video/other", () => {
    expect(classifyKind("a.webp")).toBe("image");
    expect(classifyKind("a.JPG")).toBe("image");
    expect(classifyKind("a.png")).toBe("image");
    expect(classifyKind("a.mp4")).toBe("video");
    expect(classifyKind("a.WEBM")).toBe("video");
    expect(classifyKind("a.mov")).toBe("video");
    expect(classifyKind("a.txt")).toBe("other");
  });

  it("humanSize renders bytes/KB/MB", () => {
    expect(humanSize(0)).toBe("0 B");
    expect(humanSize(900)).toBe("900 B");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("MediaLibraryError carries status and usedBy", () => {
    const err = new MediaLibraryError("nope", 409, [{ type: "Product", id: "1", label: "Toy" }]);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.usedBy).toEqual([{ type: "Product", id: "1", label: "Toy" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/modules/media/mediaLibrary.service.test.js`
Expected: FAIL — cannot resolve `./mediaLibrary.service.js`.

- [ ] **Step 3: Write the helpers + error class**

Create `server/src/modules/media/mediaLibrary.service.js`:

```js
// server/src/modules/media/mediaLibrary.service.js
import path from "node:path";
import fs from "node:fs/promises";

import Product from "../products/product.model.js";
import Category from "../catalog/category.model.js";
import Collection from "../catalog/collection.model.js";
import NavigationItem from "../catalog/navigationItem.model.js";
import HeroSlide from "../hero/heroSlide.model.js";

/**
 * Admin Media Library service. The filesystem (`server/media`) is the source of
 * truth — there is no DB model. A single referenced-media collector powers the
 * "unused" flag, the delete guard, and (in future) bulk-delete / GC.
 */

const IMAGE_EXTS = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif", ".tiff"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);

/** Error with an HTTP status and optional `usedBy` payload (for in-use deletes). */
export class MediaLibraryError extends Error {
  constructor(message, status = 400, usedBy = null) {
    super(message);
    this.name = "MediaLibraryError";
    this.status = status;
    if (usedBy) this.usedBy = usedBy;
  }
}

/** Reduce any stored media reference (url, path, bare name) to its basename. */
export function toBasename(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  return base === "" ? null : base;
}

/** Classify a filename as "image" | "video" | "other" by extension. */
export function classifyKind(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  return "other";
}

/** Human-readable byte size: B / KB / MB (one decimal, trailing zero trimmed). */
export function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${trim1(n / 1024)} KB`;
  return `${trim1(n / (1024 * 1024))} MB`;
}

function trim1(x) {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export default { toBasename, classifyKind, humanSize, MediaLibraryError };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/modules/media/mediaLibrary.service.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/media/mediaLibrary.service.js server/src/modules/media/mediaLibrary.service.test.js
git commit -m "feat(media): add media library helpers (basename, kind, size, error)"
```

---

## Task 2: `collectReferencedMedia` + `referencingEntities` + `isReferenced`

**Files:**
- Modify: `server/src/modules/media/mediaLibrary.service.js`
- Test: `server/src/modules/media/mediaLibrary.service.test.js`

- [ ] **Step 1: Write the failing test**

Append to `server/src/modules/media/mediaLibrary.service.test.js`. Add these imports at the top of the file (extend the existing import line) and a new `describe` block:

```js
import { beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Product from "../products/product.model.js";
import Category from "../catalog/category.model.js";
import Collection from "../catalog/collection.model.js";
import NavigationItem from "../catalog/navigationItem.model.js";
import HeroSlide from "../hero/heroSlide.model.js";
import { createMediaLibraryService } from "./mediaLibrary.service.js";

describe("collectReferencedMedia / isReferenced", () => {
  let mongod;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
  afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
  afterEach(async () => {
    await Promise.all([
      Product.deleteMany({}), Category.deleteMany({}), Collection.deleteMany({}),
      NavigationItem.deleteMany({}), HeroSlide.deleteMany({}),
    ]);
  });

  const svc = () => createMediaLibraryService({ getMediaDir: () => "/tmp/unused" });

  it("collects basenames from every media-bearing field across models", async () => {
    await Product.create({
      name: "Toy", slug: "toy", price: 100,
      images: ["/api/media/p1.webp", "p2.webp"], video: "pv.mp4",
      variants: [{ name: "Red", images: ["var1.webp"] }],
    });
    await Category.create({ name: "Cat", slug: "cat", image: "c.webp", heroImage: "ch.webp" });
    await Collection.create({ name: "Col", slug: "col", heroImage: "colh.webp" });
    await NavigationItem.create({ label: "Nav", targetType: "category", menuKey: "header", image: "nav.webp" });
    await HeroSlide.create({
      type: "campaign", displayMode: "full_banner", title: "H",
      desktopMedia: "hd.webp", mobileMedia: "hm.webp", video: "hv.mp4", posterImage: "hp.webp",
    });

    const refs = await svc().collectReferencedMedia();
    for (const name of ["p1.webp","p2.webp","pv.mp4","var1.webp","c.webp","ch.webp","colh.webp","nav.webp","hd.webp","hm.webp","hv.mp4","hp.webp"]) {
      expect(refs.has(name)).toBe(true);
    }
  });

  it("isReferenced consults the set", async () => {
    const refs = new Set(["x.webp"]);
    expect(svc().isReferenced("x.webp", refs)).toBe(true);
    expect(svc().isReferenced("/api/media/x.webp", refs)).toBe(true);
    expect(svc().isReferenced("y.webp", refs)).toBe(false);
  });

  it("referencingEntities lists which docs use a filename", async () => {
    const p = await Product.create({ name: "Toy", slug: "toy", price: 1, images: ["shared.webp"] });
    const c = await Category.create({ name: "Cat", slug: "cat", image: "shared.webp" });
    const used = await svc().referencingEntities("shared.webp");
    const ids = used.map((u) => u.id).sort();
    expect(ids).toEqual([String(c.id), String(p.id)].sort());
    expect(used.find((u) => u.id === String(p.id)).type).toBe("Product");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/modules/media/mediaLibrary.service.test.js`
Expected: FAIL — `createMediaLibraryService` is not exported.

- [ ] **Step 3: Implement the collector + factory skeleton**

In `server/src/modules/media/mediaLibrary.service.js`, add before the `export default` line:

```js
/**
 * Explicit map of every media-bearing model field. Over-inclusion is safe;
 * under-inclusion is the only risk, so a new media field must be added here.
 * `arrayFields` are String[]; `scalarFields` are String; `variantArrayFields`
 * are String[] nested under a top-level array of subdocuments.
 */
const MEDIA_SOURCES = [
  { Model: Product, type: "Product", labelField: "name", scalarFields: ["video"], arrayFields: ["images"], variant: { path: "variants", arrayFields: ["images"] } },
  { Model: Category, type: "Category", labelField: "name", scalarFields: ["image", "heroImage"], arrayFields: [] },
  { Model: Collection, type: "Collection", labelField: "name", scalarFields: ["heroImage"], arrayFields: [] },
  { Model: NavigationItem, type: "NavigationItem", labelField: "label", scalarFields: ["image"], arrayFields: [] },
  { Model: HeroSlide, type: "HeroSlide", labelField: "title", scalarFields: ["desktopMedia", "mobileMedia", "video", "posterImage"], arrayFields: [] },
];

/** Pull every media basename out of one loaded document, given its source spec. */
function basenamesFromDoc(doc, source) {
  const out = [];
  for (const f of source.scalarFields) { const b = toBasename(doc[f]); if (b) out.push(b); }
  for (const f of source.arrayFields) { for (const v of doc[f] || []) { const b = toBasename(v); if (b) out.push(b); } }
  if (source.variant) {
    for (const sub of doc[source.variant.path] || []) {
      for (const f of source.variant.arrayFields) { for (const v of sub[f] || []) { const b = toBasename(v); if (b) out.push(b); } }
    }
  }
  return out;
}

export function createMediaLibraryService({ getMediaDir }) {
  if (typeof getMediaDir !== "function") {
    throw new TypeError("createMediaLibraryService requires getMediaDir()");
  }

  /** Set<basename> of every media file referenced by a live document. */
  async function collectReferencedMedia() {
    const refs = new Set();
    for (const source of MEDIA_SOURCES) {
      const fields = [...source.scalarFields, ...source.arrayFields];
      if (source.variant) fields.push(source.variant.path);
      const docs = await source.Model.find({}, fields.join(" ")).lean();
      for (const doc of docs) for (const b of basenamesFromDoc(doc, source)) refs.add(b);
    }
    return refs;
  }

  /** Is `filename` (any form) present in `refSet` (set of basenames)? */
  function isReferenced(filename, refSet) {
    const base = toBasename(filename);
    return base != null && refSet.has(base);
  }

  /** List the live documents that reference `filename`: [{ type, id, label }]. */
  async function referencingEntities(filename) {
    const target = toBasename(filename);
    if (!target) return [];
    const used = [];
    for (const source of MEDIA_SOURCES) {
      const fields = [...source.scalarFields, ...source.arrayFields, source.labelField];
      if (source.variant) fields.push(source.variant.path);
      const docs = await source.Model.find({}, fields.join(" ")).lean();
      for (const doc of docs) {
        if (basenamesFromDoc(doc, source).includes(target)) {
          used.push({ type: source.type, id: String(doc._id), label: doc[source.labelField] || "" });
        }
      }
    }
    return used;
  }

  return { collectReferencedMedia, isReferenced, referencingEntities };
}
```

Then update the default export line to include the factory:

```js
export default { toBasename, classifyKind, humanSize, MediaLibraryError, createMediaLibraryService };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/modules/media/mediaLibrary.service.test.js`
Expected: PASS. If a model requires extra required fields on `create`, adjust the test fixture minimally (e.g. add a required field) — do not weaken the assertions.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/media/mediaLibrary.service.js server/src/modules/media/mediaLibrary.service.test.js
git commit -m "feat(media): collect referenced media across catalog + hero models"
```

---

## Task 3: `listMedia` + `summarize`

**Files:**
- Modify: `server/src/modules/media/mediaLibrary.service.js`
- Test: `server/src/modules/media/mediaLibrary.service.test.js`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `server/src/modules/media/mediaLibrary.service.test.js`:

```js
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

describe("listMedia / summarize", () => {
  let mongod, dir;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
  afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
  afterEach(async () => { await Product.deleteMany({}); if (dir) await fs.rm(dir, { recursive: true, force: true }); });

  async function seedDir(files) {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "medialib-"));
    for (const [name, bytes] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), Buffer.alloc(bytes, 1));
    }
    await fs.writeFile(path.join(dir, ".gitkeep"), "");
    return createMediaLibraryService({ getMediaDir: () => dir });
  }

  it("lists files with size, kind, modifiedAt, inUse; skips dotfiles", async () => {
    const svc = await seedDir({ "a.webp": 2048, "b.mp4": 1024, "c.png": 500 });
    await Product.create({ name: "T", slug: "t", price: 1, images: ["a.webp"] });
    const { items } = await svc.listMedia({});
    const names = items.map((i) => i.filename).sort();
    expect(names).toEqual(["a.webp", "b.mp4", "c.png"]);
    const a = items.find((i) => i.filename === "a.webp");
    expect(a.size).toBe(2048);
    expect(a.sizeLabel).toBe("2 KB");
    expect(a.kind).toBe("image");
    expect(a.inUse).toBe(true);
    expect(a.url).toBe("/api/media/a.webp");
    expect(typeof a.modifiedAt).toBe("string");
    expect(items.find((i) => i.filename === "b.mp4").inUse).toBe(false);
  });

  it("filters by q (substring), type, and unused", async () => {
    const svc = await seedDir({ "alpha.webp": 10, "beta.webp": 10, "clip.mp4": 10 });
    await Product.create({ name: "T", slug: "t", price: 1, images: ["alpha.webp"] });
    expect((await svc.listMedia({ q: "lph" })).items.map((i) => i.filename)).toEqual(["alpha.webp"]);
    expect((await svc.listMedia({ type: "video" })).items.map((i) => i.filename)).toEqual(["clip.mp4"]);
    expect((await svc.listMedia({ type: "image" })).items.map((i) => i.filename).sort()).toEqual(["alpha.webp", "beta.webp"]);
    const unused = (await svc.listMedia({ filter: "unused" })).items.map((i) => i.filename).sort();
    expect(unused).toEqual(["beta.webp", "clip.mp4"]);
  });

  it("summary totals are computed over the full set, independent of filters", async () => {
    const svc = await seedDir({ "a.webp": 1000, "b.mp4": 2000, "c.png": 3000 });
    await Product.create({ name: "T", slug: "t", price: 1, images: ["a.webp"] });
    const { summary } = await svc.listMedia({ q: "zzz" }); // filter matches nothing
    expect(summary.totalFiles).toBe(3);
    expect(summary.totalBytes).toBe(6000);
    expect(summary.imageCount).toBe(2);
    expect(summary.videoCount).toBe(1);
    expect(summary.unusedFiles).toBe(2);
    expect(summary.unusedBytes).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/modules/media/mediaLibrary.service.test.js`
Expected: FAIL — `svc.listMedia is not a function`.

- [ ] **Step 3: Implement `listMedia` + `summarize`**

In `server/src/modules/media/mediaLibrary.service.js`, inside `createMediaLibraryService`, add these functions and extend the returned object:

```js
  /** Build the full item set (all files, with inUse), unsorted. */
  async function readAllItems(refSet) {
    const dir = getMediaDir();
    let names;
    try { names = await fs.readdir(dir); } catch { return []; }
    const items = [];
    for (const name of names) {
      if (name.startsWith(".")) continue; // skip .gitkeep and dotfiles
      let stat;
      try { stat = await fs.stat(path.join(dir, name)); } catch { continue; }
      if (!stat.isFile()) continue;
      items.push({
        filename: name,
        url: `/api/media/${name}`,
        size: stat.size,
        sizeLabel: humanSize(stat.size),
        modifiedAt: stat.mtime.toISOString(),
        kind: classifyKind(name),
        inUse: refSet.has(name),
      });
    }
    return items;
  }

  function summarize(allItems) {
    const summary = {
      totalFiles: allItems.length, totalBytes: 0, totalLabel: "",
      imageCount: 0, videoCount: 0,
      unusedFiles: 0, unusedBytes: 0, unusedLabel: "",
    };
    for (const it of allItems) {
      summary.totalBytes += it.size;
      if (it.kind === "image") summary.imageCount += 1;
      else if (it.kind === "video") summary.videoCount += 1;
      if (!it.inUse) { summary.unusedFiles += 1; summary.unusedBytes += it.size; }
    }
    summary.totalLabel = humanSize(summary.totalBytes);
    summary.unusedLabel = humanSize(summary.unusedBytes);
    return summary;
  }

  /** List media, applying q/type/filter; summary is over the FULL set. */
  async function listMedia({ q = "", type = "all", filter = "all" } = {}) {
    const refSet = await collectReferencedMedia();
    const all = await readAllItems(refSet);
    const summary = summarize(all);
    const needle = String(q || "").trim().toLowerCase();
    let items = all;
    if (needle) items = items.filter((i) => i.filename.toLowerCase().includes(needle));
    if (type === "image" || type === "video") items = items.filter((i) => i.kind === type);
    if (filter === "unused") items = items.filter((i) => !i.inUse);
    items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)); // newest first
    return { items, summary };
  }
```

Update the `return` statement of `createMediaLibraryService` to:

```js
  return { collectReferencedMedia, isReferenced, referencingEntities, listMedia, summarize };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/modules/media/mediaLibrary.service.test.js`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/media/mediaLibrary.service.js server/src/modules/media/mediaLibrary.service.test.js
git commit -m "feat(media): list + summarize media library with filters"
```

---

## Task 4: `deleteMedia` (traversal guard + in-use guard + unlink)

**Files:**
- Modify: `server/src/modules/media/mediaLibrary.service.js`
- Test: `server/src/modules/media/mediaLibrary.service.test.js`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `server/src/modules/media/mediaLibrary.service.test.js`:

```js
describe("deleteMedia", () => {
  let mongod, dir;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
  afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
  afterEach(async () => { await Product.deleteMany({}); if (dir) await fs.rm(dir, { recursive: true, force: true }); });

  async function seedDir(files) {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "medialib-del-"));
    for (const [name, bytes] of Object.entries(files)) await fs.writeFile(path.join(dir, name), Buffer.alloc(bytes, 1));
    return createMediaLibraryService({ getMediaDir: () => dir });
  }

  it("unlinks an unused file", async () => {
    const svc = await seedDir({ "gone.webp": 10 });
    const res = await svc.deleteMedia("gone.webp");
    expect(res).toEqual({ deleted: true });
    await expect(fs.stat(path.join(dir, "gone.webp"))).rejects.toBeTruthy();
  });

  it("throws 409 with usedBy for a referenced file and does NOT unlink", async () => {
    const svc = await seedDir({ "live.webp": 10 });
    await Product.create({ name: "Live Toy", slug: "lt", price: 1, images: ["live.webp"] });
    await expect(svc.deleteMedia("live.webp")).rejects.toMatchObject({
      status: 409,
      usedBy: [{ type: "Product" }],
    });
    await expect(fs.stat(path.join(dir, "live.webp"))).resolves.toBeTruthy(); // still there
  });

  it("rejects path traversal / nested paths with 400", async () => {
    const svc = await seedDir({ "ok.webp": 10 });
    for (const bad of ["../secret", "a/b.webp", "..\\win", "/etc/passwd"]) {
      await expect(svc.deleteMedia(bad)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("returns 404 when the file does not exist", async () => {
    const svc = await seedDir({ "exists.webp": 10 });
    await expect(svc.deleteMedia("missing.webp")).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/modules/media/mediaLibrary.service.test.js`
Expected: FAIL — `svc.deleteMedia is not a function`.

- [ ] **Step 3: Implement `deleteMedia`**

In `server/src/modules/media/mediaLibrary.service.js`, inside `createMediaLibraryService`, add:

```js
  /** Delete one unused media file. Guards against traversal and in-use assets. */
  async function deleteMedia(filename) {
    const name = String(filename ?? "");
    // Path-traversal guard: must be a bare basename with no separators or `..`.
    if (name === "" || name !== path.basename(name) || name === "." || name === "..") {
      throw new MediaLibraryError("Invalid media filename.", 400);
    }
    const used = await referencingEntities(name);
    if (used.length > 0) {
      throw new MediaLibraryError("Media is in use and cannot be deleted.", 409, used);
    }
    const target = path.join(getMediaDir(), name);
    try {
      await fs.unlink(target);
    } catch (err) {
      if (err && err.code === "ENOENT") throw new MediaLibraryError("Media not found.", 404);
      throw err;
    }
    return { deleted: true };
  }
```

Update the `return` statement of `createMediaLibraryService` to:

```js
  return { collectReferencedMedia, isReferenced, referencingEntities, listMedia, summarize, deleteMedia };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/modules/media/mediaLibrary.service.test.js`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/media/mediaLibrary.service.js server/src/modules/media/mediaLibrary.service.test.js
git commit -m "feat(media): guarded deleteMedia (traversal + in-use + 404)"
```

---

## Task 5: Controller handlers (`createListHandler`, `createDeleteHandler`)

**Files:**
- Modify: `server/src/modules/media/media.controller.js`

(No standalone unit test — covered by the router test in Task 6, matching the existing module's pattern where `createUploadHandler` is exercised through `media.router.test.js`.)

- [ ] **Step 1: Add the handlers**

In `server/src/modules/media/media.controller.js`, add after `createUploadHandler` (before the `export default`):

```js
/**
 * Build the media-library list handler bound to a media library service.
 * Maps `?q=&type=&filter=` query params to the service call.
 *
 * @param {{ listMedia: Function }} mediaLibraryService
 * @returns {import("express").RequestHandler}
 */
export function createListHandler(mediaLibraryService) {
  return async function listMedia(req, res, next) {
    try {
      const { q = "", type = "all", filter = "all" } = req.query;
      const { items, summary } = await mediaLibraryService.listMedia({ q, type, filter });
      res.status(200).json({ items, summary });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Build the media-library delete handler. Returns 200 on success, 409 with a
 * `usedBy` payload when the file is referenced, 400 for an invalid name, and
 * 404 when the file is missing — using the status carried by MediaLibraryError.
 *
 * @param {{ deleteMedia: Function }} mediaLibraryService
 * @returns {import("express").RequestHandler}
 */
export function createDeleteHandler(mediaLibraryService) {
  return async function deleteMedia(req, res, next) {
    try {
      const result = await mediaLibraryService.deleteMedia(req.params.filename);
      res.status(200).json(result);
    } catch (err) {
      if (err && err.name === "MediaLibraryError") {
        const body = { error: { message: err.message, status: err.status } };
        if (err.usedBy) body.usedBy = err.usedBy;
        return res.status(err.status).json(body);
      }
      next(err);
    }
  };
}
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd server && node --input-type=module -e "import('./src/modules/media/media.controller.js').then(m=>console.log(Object.keys(m)))"`
Expected: prints an array including `createUploadHandler`, `createListHandler`, `createDeleteHandler`.

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/media/media.controller.js
git commit -m "feat(media): add list + delete controller handlers"
```

---

## Task 6: Wire routes into the admin media router

**Files:**
- Modify: `server/src/modules/media/media.router.js`
- Test: `server/src/modules/media/media.router.library.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/modules/media/media.router.library.test.js`:

```js
// server/src/modules/media/media.router.library.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createMediaUploadRouter } from "./media.router.js";
import { createMediaService } from "./media.service.js";
import { createMediaLibraryService } from "./mediaLibrary.service.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import Product from "../products/product.model.js";

let mongod, dir;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); if (dir) await fs.rm(dir, { recursive: true, force: true }); });

async function buildApp({ authorized = true, files = {} } = {}) {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "medialib-router-"));
  for (const [name, bytes] of Object.entries(files)) await fs.writeFile(path.join(dir, name), Buffer.alloc(bytes, 1));
  const mediaService = createMediaService({ uploads: { allowedMediaTypes: ["image/png"], maxUploadSizeMb: 5 }, mediaDir: dir });
  const mediaLibraryService = createMediaLibraryService({ getMediaDir: mediaService.getMediaDir });
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Auth required", status: 401 } });
    req.admin = { id: "a" }; next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/admin/media", createMediaUploadRouter({ mediaService, mediaLibraryService, requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/media` };
}

describe("media library router", () => {
  it("GET / requires auth", async () => {
    const { server, base } = await buildApp({ authorized: false });
    try { expect((await fetch(base)).status).toBe(401); } finally { server.close(); }
  });

  it("GET / returns items + summary", async () => {
    const { server, base } = await buildApp({ files: { "a.png": 1000, "b.mp4": 2000 } });
    try {
      const data = await (await fetch(base)).json();
      expect(data.items.map((i) => i.filename).sort()).toEqual(["a.png", "b.mp4"]);
      expect(data.summary.totalFiles).toBe(2);
    } finally { server.close(); }
  });

  it("DELETE unused -> 200; removes file", async () => {
    const { server, base } = await buildApp({ files: { "x.png": 10 } });
    try {
      const r = await fetch(`${base}/x.png`, { method: "DELETE" });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ deleted: true });
    } finally { server.close(); }
  });

  it("DELETE in-use -> 409 with usedBy", async () => {
    const { server, base } = await buildApp({ files: { "live.png": 10 } });
    await Product.create({ name: "Live", slug: "live", price: 1, images: ["live.png"] });
    try {
      const r = await fetch(`${base}/live.png`, { method: "DELETE" });
      expect(r.status).toBe(409);
      const body = await r.json();
      expect(body.usedBy[0].type).toBe("Product");
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/modules/media/media.router.library.test.js`
Expected: FAIL — `createMediaUploadRouter` ignores `mediaLibraryService`; `GET /` returns 404 (or upload-only behavior).

- [ ] **Step 3: Extend the router**

In `server/src/modules/media/media.router.js`:

(a) Update the import of the controller to add the new handlers:

```js
import { createUploadHandler, createListHandler, createDeleteHandler } from "./media.controller.js";
```

(b) Add the library service import factory:

```js
import { createMediaLibraryService } from "./mediaLibrary.service.js";
```

(c) Change `createMediaUploadRouter` to accept `mediaLibraryService` and register the new routes. Replace the existing function body:

```js
export function createMediaUploadRouter({ mediaService, mediaLibraryService, requireAuth = passthrough }) {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: mediaService.getMaxUploadBytes() || undefined },
  });

  router.post(
    "/",
    requireAuth,
    wrapMulter(upload.single("file")),
    createUploadHandler(mediaService)
  );

  if (mediaLibraryService) {
    router.get("/", requireAuth, createListHandler(mediaLibraryService));
    router.delete("/:filename", requireAuth, createDeleteHandler(mediaLibraryService));
  }

  return router;
}
```

(d) In `createMediaRouters`, build the library service from the shared media service and inject it. Replace the `return` block:

```js
  const library = createMediaLibraryService({ getMediaDir: service.getMediaDir });

  return {
    mediaService: service,
    mediaLibraryService: library,
    uploadRouter: createMediaUploadRouter({ mediaService: service, mediaLibraryService: library, requireAuth }),
    serveRouter: createMediaServeRouter({ mediaService: service }),
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/modules/media/media.router.library.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the existing media tests to confirm no regression**

Run: `cd server && npx vitest run src/modules/media/media.router.test.js src/modules/media/media.router.storage.test.js`
Expected: PASS (upload + serve behavior unchanged — the new routes are additive and `GET /:filename` serving is on the separate serve router).

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/media/media.router.js server/src/modules/media/media.router.library.test.js
git commit -m "feat(media): expose admin GET list + DELETE on media router"
```

---

## Task 7: Wire the library service in app bootstrap

**Files:**
- Modify: `server/src/index.js:70-75`

(No new test — `createMediaRouters` already builds and returns `mediaLibraryService`; this task only consumes it. Smoke-verify via import.)

- [ ] **Step 1: Confirm the destructure**

`server/src/index.js` lines 70-75 currently destructure only `uploadRouter` and `serveRouter`. The library service is already built inside `createMediaRouters` (Task 6) and injected into `uploadRouter`, so the mounted `app.use("/api/admin/media", mediaUploadRouter)` at line 140 now serves list/delete automatically. No code change is required to the destructure for functionality.

Update the comment at line 70 to reflect the new responsibility:

```js
// Build media routers (upload + serve + admin library share one media service).
const { uploadRouter: mediaUploadRouter, serveRouter: mediaServeRouter } =
  createMediaRouters({
    uploads: config.uploads,
    requireAuth,
  });
```

- [ ] **Step 2: Smoke-test the server boots and the route table includes the new endpoints**

Run: `cd server && node --input-type=module -e "import('./src/modules/media/media.router.js').then(m=>{const r=m.createMediaRouters({uploads:{allowedMediaTypes:['image/png'],maxUploadSizeMb:5}});console.log('hasLibrary', !!r.mediaLibraryService)})"`
Expected: prints `hasLibrary true`.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.js
git commit -m "chore(media): document media library wiring in bootstrap"
```

---

## Task 8: Admin page — data layer + storage summary card

**Files:**
- Create: `apps/admin/src/pages/admin/content/MediaLibraryPage.jsx`
- Create: `apps/admin/src/pages/admin/content/MediaLibraryPage.css`
- Test: `apps/admin/src/pages/admin/content/MediaLibraryPage.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/pages/admin/content/MediaLibraryPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MediaLibraryPage from "./MediaLibraryPage.jsx";

const sample = {
  items: [
    { filename: "a.webp", url: "/api/media/a.webp", size: 2048, sizeLabel: "2 KB", modifiedAt: "2026-06-10T00:00:00.000Z", kind: "image", inUse: true },
    { filename: "b.mp4", url: "/api/media/b.mp4", size: 4096, sizeLabel: "4 KB", modifiedAt: "2026-06-09T00:00:00.000Z", kind: "video", inUse: false },
  ],
  summary: { totalFiles: 2, totalBytes: 6144, totalLabel: "6 KB", imageCount: 1, videoCount: 1, unusedFiles: 1, unusedBytes: 4096, unusedLabel: "4 KB" },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => sample })));
  globalThis.localStorage?.setItem?.("pot_admin_token", "t");
});
afterEach(() => { vi.unstubAllMocks(); });

describe("MediaLibraryPage", () => {
  it("renders the storage summary card and a card per item", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    expect(screen.getByText("b.mp4")).toBeInTheDocument();
    // Summary totals
    expect(screen.getByText(/6 KB/)).toBeInTheDocument();
    expect(screen.getByText(/2 files/i)).toBeInTheDocument();
  });

  it("shows In use / Unused badges", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    expect(screen.getByText(/In use/i)).toBeInTheDocument();
    expect(screen.getByText(/Unused/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && npx vitest run src/pages/admin/content/MediaLibraryPage.test.jsx`
Expected: FAIL — cannot resolve `./MediaLibraryPage.jsx`.

- [ ] **Step 3: Create the CSS**

Create `apps/admin/src/pages/admin/content/MediaLibraryPage.css`:

```css
/* apps/admin/src/pages/admin/content/MediaLibraryPage.css */
.medialib { display: grid; gap: var(--space-5, 24px); }
.medialib__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.medialib__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.medialib__stat { border: 1px solid var(--color-border, #e6ebf5); border-radius: 12px; padding: 14px 16px; background: #fff; }
.medialib__stat-value { font-size: 1.25rem; font-weight: 800; color: var(--color-text-primary, #1e293b); }
.medialib__stat-label { font-size: .8rem; color: var(--color-text-secondary, #64748b); }
.medialib__toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.medialib__toolbar input[type="search"] { padding: 8px 12px; border: 1px solid var(--color-border, #e6ebf5); border-radius: 8px; min-width: 220px; }
.medialib__toolbar select { padding: 8px 10px; border: 1px solid var(--color-border, #e6ebf5); border-radius: 8px; }
.medialib__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.medialib__card { border: 1px solid var(--color-border, #e6ebf5); border-radius: 14px; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
.medialib__thumb { aspect-ratio: 4 / 3; background: #f1f5fb; display: grid; place-items: center; overflow: hidden; }
.medialib__thumb img, .medialib__thumb video { width: 100%; height: 100%; object-fit: cover; }
.medialib__meta { padding: 10px 12px; display: grid; gap: 4px; }
.medialib__name { font-weight: 700; font-size: .9rem; word-break: break-all; }
.medialib__sub { font-size: .78rem; color: var(--color-text-secondary, #64748b); }
.medialib__badge { justify-self: start; font-size: .72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.medialib__badge--used { background: #e7f6ec; color: #1a7f43; }
.medialib__badge--unused { background: #fdeaea; color: #b42318; }
.medialib__actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 12px; }
.medialib__actions button, .medialib__actions a { font-size: .78rem; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--color-border, #e6ebf5); background: #fff; color: var(--color-text-primary, #1e293b); cursor: pointer; text-decoration: none; }
.medialib__actions button[disabled] { opacity: .5; cursor: not-allowed; }
.medialib__actions .medialib__delete { color: var(--color-primary, #f81424); border-color: var(--color-primary, #f81424); }
.medialib__status { color: var(--color-text-secondary, #64748b); }
.medialib__err { color: var(--color-primary, #f81424); }
```

- [ ] **Step 4: Create the page (summary + grid + badges only)**

Create `apps/admin/src/pages/admin/content/MediaLibraryPage.jsx`:

```jsx
// apps/admin/src/pages/admin/content/MediaLibraryPage.jsx
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl } from "@planet-of-toys/shared-web/format";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import "./MediaLibraryPage.css";

const ENDPOINT = `${API_BASE_URL}/api/admin/media`;

export default function MediaLibraryPage() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams({ q, type, filter });
      const res = await fetch(`${ENDPOINT}?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.status === 401) return notifyUnauthorized();
      if (!res.ok) throw new Error("load failed");
      setData(await res.json());
    } catch {
      setErr("Could not load media.");
    }
  }, [q, type, filter]);
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="medialib__err" role="alert">{err}</p>;
  if (data === null) return <p className="medialib__status">Loading…</p>;

  const { items, summary } = data;

  return (
    <div className="medialib">
      <header className="medialib__head"><h1>Media Library</h1></header>

      <section className="medialib__summary" aria-label="Storage summary">
        <div className="medialib__stat"><div className="medialib__stat-value">{summary.totalLabel}</div><div className="medialib__stat-label">{summary.totalFiles} files</div></div>
        <div className="medialib__stat"><div className="medialib__stat-value">{summary.imageCount}</div><div className="medialib__stat-label">images</div></div>
        <div className="medialib__stat"><div className="medialib__stat-value">{summary.videoCount}</div><div className="medialib__stat-label">videos</div></div>
        <div className="medialib__stat"><div className="medialib__stat-value">{summary.unusedFiles}</div><div className="medialib__stat-label">unused ({summary.unusedLabel})</div></div>
      </section>

      <section className="medialib__grid" aria-label="Media files">
        {items.map((it) => (
          <article key={it.filename} className="medialib__card">
            <div className="medialib__thumb">
              {it.kind === "video"
                ? <video src={mediaUrl(it.filename)} muted />
                : <img src={mediaUrl(it.filename)} alt={it.filename} loading="lazy" />}
            </div>
            <div className="medialib__meta">
              <span className="medialib__name">{it.filename}</span>
              <span className="medialib__sub">{it.sizeLabel} · {new Date(it.modifiedAt).toLocaleDateString()}</span>
              <span className={`medialib__badge ${it.inUse ? "medialib__badge--used" : "medialib__badge--unused"}`}>{it.inUse ? "In use" : "Unused"}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/admin && npx vitest run src/pages/admin/content/MediaLibraryPage.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/admin/content/MediaLibraryPage.jsx apps/admin/src/pages/admin/content/MediaLibraryPage.css apps/admin/src/pages/admin/content/MediaLibraryPage.test.jsx
git commit -m "feat(admin): media library page with storage summary + grid"
```

---

## Task 9: Admin page — toolbar (search, type, usage), upload, copy/open/download/delete

**Files:**
- Modify: `apps/admin/src/pages/admin/content/MediaLibraryPage.jsx`
- Test: `apps/admin/src/pages/admin/content/MediaLibraryPage.test.jsx`

- [ ] **Step 1: Add the failing tests**

Append to the `describe("MediaLibraryPage", …)` block in `apps/admin/src/pages/admin/content/MediaLibraryPage.test.jsx`:

```jsx
  it("typing in search re-fetches with q param", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "clip" } });
    await waitFor(() => {
      const urls = fetch.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("q=clip"))).toBe(true);
    });
  });

  it("copies the absolute URL via clipboard", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /copy url/i })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0][0])).toContain("/api/media/a.webp");
  });

  it("Delete on an unused item calls DELETE and refreshes", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("b.mp4")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /delete b\.mp4/i }));
    await waitFor(() => {
      const del = fetch.mock.calls.find((c) => c[1]?.method === "DELETE");
      expect(del).toBeTruthy();
      expect(String(del[0])).toContain("/api/admin/media/b.mp4");
    });
  });

  it("Delete is disabled for in-use items", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /delete a\.webp/i })).toBeDisabled();
  });
```

Note: the Delete test relies on `window.confirm`. Add to `beforeEach`: `vi.stubGlobal("confirm", vi.fn(() => true));`

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/admin && npx vitest run src/pages/admin/content/MediaLibraryPage.test.jsx`
Expected: FAIL — no searchbox / no Copy URL / Delete buttons yet.

- [ ] **Step 3: Add the toolbar, upload, and per-card actions**

In `apps/admin/src/pages/admin/content/MediaLibraryPage.jsx`, add an upload handler and delete handler inside the component (after `load`):

```jsx
  const onUpload = useCallback(async (file) => {
    if (!file) return;
    setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
      if (res.status === 401) return notifyUnauthorized();
      if (!res.ok) throw new Error("upload failed");
      await load();
    } catch { setErr("Upload failed."); }
  }, [load]);

  const onDelete = useCallback(async (item) => {
    if (item.inUse) return;
    if (!window.confirm(`Delete ${item.filename}? This cannot be undone.`)) return;
    setErr(null);
    try {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(item.filename)}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.status === 401) return notifyUnauthorized();
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        const who = (body.usedBy || []).map((u) => `${u.type} "${u.label}"`).join(", ");
        setErr(`Cannot delete — in use by ${who || "another item"}.`);
        return;
      }
      if (!res.ok) throw new Error("delete failed");
      await load();
    } catch { setErr("Delete failed."); }
  }, [load]);

  const onCopy = useCallback(async (item) => {
    try { await navigator.clipboard.writeText(`${API_BASE_URL}${item.url}`); } catch { /* ignore */ }
  }, []);

  const onDownload = useCallback(async (item) => {
    try {
      const res = await fetch(mediaUrl(item.filename));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = item.filename; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(href);
    } catch { setErr("Download failed."); }
  }, []);
```

Replace the `<header>` and add a toolbar; update the card actions. The header becomes:

```jsx
      <header className="medialib__head">
        <h1>Media Library</h1>
        <label className="medialib__upload-btn">
          Upload
          <input type="file" accept="image/*,video/*" hidden onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} />
        </label>
      </header>
```

Add the toolbar after the summary section:

```jsx
      <section className="medialib__toolbar" aria-label="Filters">
        <input type="search" placeholder="Search filename…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search filename" />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type filter">
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Usage filter">
          <option value="all">All</option>
          <option value="unused">Unused</option>
        </select>
      </section>
```

Replace the card's `<div className="medialib__meta">…</div>` to append an actions block right after it:

```jsx
            <div className="medialib__actions">
              <a href={mediaUrl(it.filename)} target="_blank" rel="noreferrer">Open</a>
              <button type="button" onClick={() => onDownload(it)}>Download</button>
              <button type="button" onClick={() => onCopy(it)} aria-label={`Copy URL ${it.filename}`}>Copy URL</button>
              <button type="button" className="medialib__delete" disabled={it.inUse} onClick={() => onDelete(it)} aria-label={`Delete ${it.filename}`}>Delete</button>
            </div>
```

Add this rule to `MediaLibraryPage.css`:

```css
.medialib__upload-btn { font-size: .85rem; font-weight: 700; padding: 8px 16px; border-radius: 8px; background: var(--color-primary, #f81424); color: #fff; cursor: pointer; }
.medialib__upload-btn input { display: none; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/admin && npx vitest run src/pages/admin/content/MediaLibraryPage.test.jsx`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/admin/content/MediaLibraryPage.jsx apps/admin/src/pages/admin/content/MediaLibraryPage.css apps/admin/src/pages/admin/content/MediaLibraryPage.test.jsx
git commit -m "feat(admin): media library toolbar, upload, copy/open/download/delete"
```

---

## Task 10: Register the route + sidebar link

**Files:**
- Modify: `apps/admin/src/App.jsx`
- Modify: `apps/admin/src/components/AdminLayout.jsx:111-116`
- Test: `apps/admin/src/pages/admin/content/ContentRouting.test.jsx` (extend if it asserts route presence) OR `apps/admin/src/App.test.jsx`

- [ ] **Step 1: Write/extend the failing test**

Add to `apps/admin/src/pages/admin/content/ContentRouting.test.jsx` a case that the Media Library route renders. First read that file to match its harness; then add (adapting to its existing render helper):

```jsx
  it("renders Media Library at /admin/content/media-library", async () => {
    // Stub fetch so MediaLibraryPage's load() resolves.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [], summary: { totalFiles: 0, totalBytes: 0, totalLabel: "0 B", imageCount: 0, videoCount: 0, unusedFiles: 0, unusedBytes: 0, unusedLabel: "0 B" } }) })));
    renderAt("/admin/content/media-library"); // use this file's existing navigation helper
    await screen.findByRole("heading", { name: /media library/i });
  });
```

If `ContentRouting.test.jsx` uses a different mount pattern, mirror it exactly (same imports, same provider wrapper, same auth stubbing). The assertion that matters: navigating to `/admin/content/media-library` shows the "Media Library" heading.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && npx vitest run src/pages/admin/content/ContentRouting.test.jsx`
Expected: FAIL — route not registered (renders NotFound / no heading).

- [ ] **Step 3: Register the route**

In `apps/admin/src/App.jsx`, add the import alongside the other content-page imports:

```jsx
import MediaLibraryPage from "./pages/admin/content/MediaLibraryPage.jsx";
```

And add the route inside the `content` route block (after the `navigation` route):

```jsx
            <Route path="media-library" element={<MediaLibraryPage />} />
```

- [ ] **Step 4: Add the sidebar link**

In `apps/admin/src/components/AdminLayout.jsx`, extend the Content `children` array (lines 111-116) to include:

```jsx
      { to: "/admin/content/media-library", label: "Media Library" },
```

(Place it after the `navigation` entry.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/admin && npx vitest run src/pages/admin/content/ContentRouting.test.jsx src/App.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/App.jsx apps/admin/src/components/AdminLayout.jsx apps/admin/src/pages/admin/content/ContentRouting.test.jsx
git commit -m "feat(admin): register Media Library route + sidebar link"
```

---

## Task 11: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the server media suite**

Run: `cd server && npx vitest run src/modules/media/`
Expected: PASS — all media service + router tests (run media in isolation to avoid the known mongodb-memory-server contention flakes; if a flake appears, re-run the single file).

- [ ] **Step 2: Run the admin suite**

Run: `cd apps/admin && npx vitest run`
Expected: PASS — including the new MediaLibraryPage + routing tests.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Start the server and admin app, log in, open Content → Media Library. Confirm: summary card shows totals; grid lists files; search/type/unused filters work; Copy URL, Open, Download work; deleting an unused file removes it; deleting an in-use file shows the "in use by …" message.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(media): verify media library end-to-end"
```

---

## Self-Review

**1. Spec coverage:**
- List all media → Task 3 (`listMedia`) + Task 8 (grid). ✓
- Search → Task 3 (`q`) + Task 9 (searchbox). ✓
- Copy URL → Task 9 (`onCopy`). ✓
- Preview/Open → Task 9 (Open link, new tab) + Task 8 (thumbnail). ✓
- Download → Task 9 (`onDownload`, blob). ✓
- Delete → Task 4 (service) + Task 6 (route) + Task 9 (button, in-use disabled + 409 message). ✓
- File size + upload date → Task 3 (`size`/`sizeLabel`/`modifiedAt`) + Task 8 (sub line). ✓
- Total storage / summary card → Task 3 (`summarize`) + Task 8 (summary section). ✓
- Image/Video filter → Task 3 (`type`) + Task 9 (type select). ✓
- Unused filter → Task 3 (`filter=unused`) + Task 9 (usage select). ✓
- Files stay in `server/media`, no Cloudflare/R2 → service uses `getMediaDir()` only. ✓
- Bulk-delete / GC readiness → `collectReferencedMedia` + `isReferenced` + guarded unlink exported from the service (Tasks 2 & 4). ✓
- No change to checkout/orders/payments/auth → only media module + admin content page touched. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code. Task 10 references the existing `ContentRouting.test.jsx` harness — the step instructs reading it first and mirroring its render helper because that helper's exact name is environment-specific; the assertion is fully specified.

**3. Type consistency:** Service returns `{ items, summary }` everywhere (Tasks 3, 6, 8). Item shape `{ filename, url, size, sizeLabel, modifiedAt, kind, inUse }` is identical across service, router test, and page. `MediaLibraryError` `{ status, usedBy }` consistent across Tasks 1/4/5/6/9. Factory name `createMediaLibraryService` and method names (`collectReferencedMedia`, `referencingEntities`, `isReferenced`, `listMedia`, `summarize`, `deleteMedia`) consistent across all tasks. `summarize` field names (`totalFiles`, `totalBytes`, `totalLabel`, `imageCount`, `videoCount`, `unusedFiles`, `unusedBytes`, `unusedLabel`) match between service (Task 3), service test (Task 3), and page (Task 8).
