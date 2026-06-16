// server/src/scripts/seed-hero.js
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../shared/config/database.js";
import HeroSlide from "../modules/hero/heroSlide.model.js";
import Collection from "../modules/catalog/collection.model.js";

/**
 * Seed a few sample published hero slides so the homepage renders immediately.
 * Idempotent: skips a slide if one with the same title already exists. Everything
 * is editable afterwards in Admin → Content → Hero Banner.
 *
 *   npm run seed:hero --workspace=server
 */
async function ensure(title, doc) {
  if (await HeroSlide.exists({ title })) return;
  await HeroSlide.create({ title, ...doc });
}

async function main() {
  await connectDatabase();
  try {
    const stem = await Collection.findOne({ name: "STEM Toys" }) || await Collection.findOne({});
    await ensure("Summer Sale", {
      type: "campaign", displayMode: "full_banner", subtitle: "Up to 50% off everything",
      ctaText: "Shop the Sale", ctaType: "customUrl", customUrl: "/sale",
      status: "published", active: true, priority: 100, sortOrder: 0,
    });
    if (stem) {
      await ensure("STEM Picks", {
        type: "collection", displayMode: "collection_grid", subtitle: "Hand-picked learning toys",
        ctaText: "Explore STEM", ctaType: "collection", collectionId: stem._id,
        status: "published", active: true, priority: 50, sortOrder: 1,
      });
    }
    await ensure("New Arrivals", {
      type: "campaign", displayMode: "split", subtitle: "Fresh toys, just landed",
      ctaText: "See what's new", ctaType: "customUrl", customUrl: "/collections/new-arrivals",
      status: "published", active: true, priority: 20, sortOrder: 2,
    });
    // eslint-disable-next-line no-console
    console.log("Hero slides seeded.");
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
