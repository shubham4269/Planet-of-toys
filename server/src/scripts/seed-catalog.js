// server/src/scripts/seed-catalog.js
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../shared/config/database.js";
import * as categories from "../modules/catalog/category.service.js";
import * as collections from "../modules/catalog/collection.service.js";
import * as attributes from "../modules/catalog/attribute.service.js";
import Category from "../modules/catalog/category.model.js";
import Collection from "../modules/catalog/collection.model.js";
import Attribute from "../modules/catalog/attribute.model.js";

/**
 * Seed sample Planet of Toys catalog taxonomy: a few categories, collections,
 * and attributes-with-values. Everything is editable afterwards in Admin →
 * Catalog. Skips entities that already exist (by name) so re-running is safe.
 *
 * Run from the server workspace so dotenv picks up server/.env:
 *   npm run seed:catalog --workspace=server
 */

const CATEGORIES = ["Educational Toys", "Building Blocks", "Arts & Crafts", "Puzzles", "Outdoor Toys", "Pretend Play", "Board Games"];
const COLLECTIONS = ["New Arrivals", "Best Sellers", "STEM Toys", "Birthday Gifts", "Eco Friendly Toys"];
const ATTRIBUTES = [
  { name: "Age Group", displayType: "checkbox", values: ["0-12 Months", "1-2 Years", "2-4 Years", "5-8 Years", "8+ Years"] },
  { name: "Skill Development", displayType: "checkbox", values: ["Creativity", "Motor Skills", "Problem Solving", "STEM Learning", "Language Skills"] },
  { name: "Theme", displayType: "checkbox", values: ["Animals", "Vehicles", "Space", "Nature"] },
  { name: "Price", displayType: "range", values: [] },
];

async function ensureCategory(name) {
  if (await Category.exists({ name })) return;
  await categories.createCategory({ name });
}
async function ensureCollection(name) {
  if (await Collection.exists({ name })) return;
  await collections.createCollection({ name });
}
async function ensureAttribute({ name, displayType, values }) {
  let attr = await Attribute.findOne({ name });
  if (!attr) attr = { id: (await attributes.createAttribute({ name, displayType })).id };
  for (const v of values) {
    // eslint-disable-next-line no-await-in-loop
    await attributes.addValue(attr.id, { name: v });
  }
}

async function main() {
  await connectDatabase();
  try {
    for (const c of CATEGORIES) await ensureCategory(c);
    for (const k of COLLECTIONS) await ensureCollection(k);
    for (const a of ATTRIBUTES) await ensureAttribute(a);
    // eslint-disable-next-line no-console
    console.log("Catalog seed complete.");
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
