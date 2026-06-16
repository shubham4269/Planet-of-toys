// server/src/scripts/seed-navigation.js
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../shared/config/database.js";
import NavigationItem from "../modules/catalog/navigationItem.model.js";
import Category from "../modules/catalog/category.model.js";
import * as categories from "../modules/catalog/category.service.js";
import * as nav from "../modules/catalog/navigation.service.js";

/**
 * Seed the storefront HEADER navigation (menuKey "header"). The primary category
 * sequence starts with Pretend Play: Pretend Play, Learning Toys, Puzzles,
 * Arts & Crafts, Trains & More Toys, then Sale and Discover.
 *
 * Toy-type items are entity-based (they point at a Category via targetId — the
 * category is created if missing, so the link resolves to /category/<slug>).
 * "Sale" and "Discover" are internal routes for now.
 *
 * "Shop By Age" is intentionally NOT part of the main category flow; it is meant
 * to live as a separate utility/filter control, so it is not seeded inline here.
 *
 * This RESETS the header menu (removes existing header items) so the result
 * matches exactly, then is safe to re-run. Everything stays editable afterwards
 * in Admin → Content → Navigation.
 *
 * Run from the server workspace so dotenv picks up server/.env:
 *   npm run seed:navigation --workspace=server
 */

// Items that link to a Category (created if missing), in display order.
const CATEGORY_ITEMS = ["Pretend Play", "Learning Toys", "Puzzles", "Arts & Crafts", "Trains & More Toys"];

/** Find a category by name, or create it; returns its id. */
async function categoryId(name) {
  const existing = await Category.findOne({ name });
  if (existing) return existing.id;
  return (await categories.createCategory({ name })).id;
}

async function main() {
  await connectDatabase();
  try {
    // Reset the header menu so the seed is deterministic + re-runnable.
    await NavigationItem.deleteMany({ menuKey: "header" });

    let order = 0;
    // 1-5. Category-backed pills (the primary sequence starts with Pretend Play).
    for (const name of CATEGORY_ITEMS) {
      // eslint-disable-next-line no-await-in-loop
      const targetId = await categoryId(name);
      // eslint-disable-next-line no-await-in-loop
      await nav.createNavigationItem({ label: name, targetType: "category", targetId, menuKey: "header", sortOrder: order++ });
    }

    // 6. Sale, 7. Discover (internal routes).
    await nav.createNavigationItem({ label: "Sale", targetType: "internalRoute", url: "/sale", menuKey: "header", sortOrder: order++ });
    await nav.createNavigationItem({ label: "Discover", targetType: "internalRoute", url: "/discover", menuKey: "header", sortOrder: order++ });

    // eslint-disable-next-line no-console
    console.log("Header navigation seeded (7 items, starting with Pretend Play).");
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
