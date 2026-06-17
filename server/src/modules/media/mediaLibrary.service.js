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

/**
 * Explicit map of every media-bearing model field. Over-inclusion is safe;
 * under-inclusion is the only risk, so a new media field must be added here.
 * `arrayFields` are String[]; `scalarFields` are String; `variant.arrayFields`
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

  return { collectReferencedMedia, isReferenced, referencingEntities, listMedia, summarize, deleteMedia };
}

export default { toBasename, classifyKind, humanSize, MediaLibraryError, createMediaLibraryService };
