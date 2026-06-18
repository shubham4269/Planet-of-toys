// server/src/scripts/seed.js
/**
 * Admin seed script.
 *
 * Creates (or updates) a single admin login — email + bcrypt-hashed password —
 * so you can sign into the admin panel. No products or other data are touched.
 *
 * Idempotent: re-running just resets the password for that admin email.
 *
 * Usage:
 *   npm run seed:admin
 *
 * Credentials can be overridden via env:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { hashPassword } from "../services/auth.service.js";
import Admin from "../models/admin.model.js";

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || "admin@planetoftoys.com").toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";

/** Upsert the admin login. Returns whether it was newly created. */
async function seedAdmin() {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const existing = await Admin.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    existing.passwordHash = passwordHash;
    await existing.save();
    return false;
  }
  await Admin.create({ email: ADMIN_EMAIL, passwordHash });
  return true;
}

async function main() {
  await connectDatabase();
  try {
    const created = await seedAdmin();
    console.log(`\n✅ Admin ${created ? "created" : "updated"}:`);
    console.log(`   Email:    ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log("\nDone.\n");
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
  disconnectDatabase().finally(() => process.exit(1));
});
