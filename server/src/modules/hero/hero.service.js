// server/src/modules/hero/hero.service.js
import HeroSlide, { HERO_TYPES, HERO_DISPLAY_MODES, HERO_CTA_TYPES, HERO_STATUSES } from "./heroSlide.model.js";
import { Product, Collection, Category } from "../../models/index.js";
import { queryProductsForScope } from "../catalog/collectionQuery.service.js";
import { AppError } from "../../shared/errors/index.js";

/** Operational 400-class validation error for the hero module (client-safe message). */
export class HeroValidationError extends AppError {
  constructor(message, statusCode = 400) {
    super(message, statusCode, { clientMessage: message });
    this.name = "HeroValidationError";
  }
}

const WRITABLE = [
  "type", "displayMode", "title", "subtitle", "ctaText", "ctaType",
  "productId", "collectionId", "categoryId", "customUrl",
  "desktopMedia", "mobileMedia", "video", "posterImage", "gridProductIds",
  "status", "active", "startDate", "endDate", "priority", "sortOrder", "meta",
];

function pick(input) {
  const out = {};
  for (const k of WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function validate(data, { creating } = {}) {
  if (creating) {
    if (!HERO_TYPES.includes(data.type)) throw new HeroValidationError(`type must be one of: ${HERO_TYPES.join(", ")}.`);
    if (!HERO_DISPLAY_MODES.includes(data.displayMode)) throw new HeroValidationError(`displayMode must be one of: ${HERO_DISPLAY_MODES.join(", ")}.`);
  } else {
    if (data.type !== undefined && !HERO_TYPES.includes(data.type)) throw new HeroValidationError("Invalid type.");
    if (data.displayMode !== undefined && !HERO_DISPLAY_MODES.includes(data.displayMode)) throw new HeroValidationError("Invalid displayMode.");
  }
  if (data.ctaType !== undefined && !HERO_CTA_TYPES.includes(data.ctaType)) throw new HeroValidationError("Invalid ctaType.");
  if (data.status !== undefined && !HERO_STATUSES.includes(data.status)) throw new HeroValidationError("Invalid status.");
}

// ---- admin CRUD ----

export async function createSlide(input = {}) {
  const data = pick(input);
  validate(data, { creating: true });
  const doc = await HeroSlide.create(data);
  return doc.toJSON();
}

export async function updateSlide(id, input = {}) {
  const doc = await HeroSlide.findById(id);
  if (!doc) throw new HeroValidationError("Hero slide not found.", 404);
  const data = pick(input);
  validate(data, { creating: false });
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function getSlideById(id) {
  const doc = await HeroSlide.findById(id);
  return doc ? doc.toJSON() : null;
}

export async function listSlides({ includeDeleted = false } = {}) {
  const query = includeDeleted ? {} : { deletedAt: null };
  const docs = await HeroSlide.find(query).sort({ priority: -1, sortOrder: 1, createdAt: -1 });
  return docs.map((d) => d.toJSON());
}

export async function setActive(id, active) {
  const doc = await HeroSlide.findById(id);
  if (!doc) throw new HeroValidationError("Hero slide not found.", 404);
  doc.active = Boolean(active);
  await doc.save();
  return doc.toJSON();
}

export async function softDelete(id) {
  const doc = await HeroSlide.findById(id);
  if (!doc) throw new HeroValidationError("Hero slide not found.", 404);
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restore(id) {
  const doc = await HeroSlide.findById(id);
  if (!doc) throw new HeroValidationError("Hero slide not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

export async function reorder(items = []) {
  if (!Array.isArray(items)) throw new HeroValidationError("Reorder payload must be an array.");
  await Promise.all(items.map((it) => {
    const set = { sortOrder: Number(it.sortOrder) || 0 };
    if (it.priority !== undefined) set.priority = Number(it.priority) || 0;
    return HeroSlide.updateOne({ _id: it.id }, { $set: set });
  }));
  return listSlides({ includeDeleted: false });
}

// ---- public resolution ----

const cardOf = (j) => ({ id: j.id, slug: j.slug, name: j.name, price: j.price, images: j.images });

/** Up to 4 product cards for a collection_grid slide: manual gridProductIds, else derived. */
async function gridItemsFor(slide) {
  if (Array.isArray(slide.gridProductIds) && slide.gridProductIds.length) {
    const docs = await Product.find({ _id: { $in: slide.gridProductIds }, active: true });
    const byId = new Map(docs.map((d) => [String(d._id), cardOf(d.toJSON())]));
    return slide.gridProductIds.map((id) => byId.get(String(id))).filter(Boolean).slice(0, 4);
  }
  if (slide.collectionId) {
    const { products } = await queryProductsForScope({ field: "collectionIds", id: slide.collectionId }, { limit: 4 });
    return products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, images: p.images }));
  }
  if (slide.categoryId) {
    const { products } = await queryProductsForScope({ field: "categoryIds", id: slide.categoryId }, { limit: 4 });
    return products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, images: p.images }));
  }
  return [];
}

/** Visible, ordered, fully-resolved slides for the storefront. */
export async function getPublicSlides(now = new Date()) {
  const docs = await HeroSlide.find({
    deletedAt: null, status: "published", active: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  }).sort({ priority: -1, sortOrder: 1, createdAt: -1 });

  // Batch-load CTA targets to resolve hrefs without N+1.
  const pIds = [], colIds = [], catIds = [];
  for (const d of docs) {
    if (d.ctaType === "product" && d.productId) pIds.push(d.productId);
    if (d.ctaType === "collection" && d.collectionId) colIds.push(d.collectionId);
    if (d.ctaType === "category" && d.categoryId) catIds.push(d.categoryId);
  }
  const [prods, cols, cats] = await Promise.all([
    pIds.length ? Product.find({ _id: { $in: pIds } }) : [],
    colIds.length ? Collection.find({ _id: { $in: colIds } }) : [],
    catIds.length ? Category.find({ _id: { $in: catIds } }) : [],
  ]);
  const pSlug = new Map(prods.map((p) => [String(p._id), p.slug]));
  const colSlug = new Map(cols.map((c) => [String(c._id), c.slug]));
  const catSlug = new Map(cats.map((c) => [String(c._id), c.slug]));
  const hrefOf = (d) => {
    if (d.ctaType === "product") { const s = pSlug.get(String(d.productId)); return s ? `/product/${s}` : null; }
    if (d.ctaType === "collection") { const s = colSlug.get(String(d.collectionId)); return s ? `/collections/${s}` : null; }
    if (d.ctaType === "category") { const s = catSlug.get(String(d.categoryId)); return s ? `/category/${s}` : null; }
    if (d.ctaType === "customUrl") return d.customUrl || null;
    return null;
  };

  const out = [];
  for (const d of docs) {
    const j = d.toJSON();
    const slide = {
      id: j.id, type: j.type, displayMode: j.displayMode, title: j.title, subtitle: j.subtitle,
      ctaText: j.ctaText, ctaHref: hrefOf(j),
      desktopMedia: j.desktopMedia, mobileMedia: j.mobileMedia, video: j.video, posterImage: j.posterImage,
    };
    if (j.displayMode === "collection_grid") {
      // eslint-disable-next-line no-await-in-loop
      slide.gridItems = await gridItemsFor(j);
    }
    out.push(slide);
  }
  return out;
}
