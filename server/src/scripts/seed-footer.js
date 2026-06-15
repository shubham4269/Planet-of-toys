import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../shared/config/database.js";
import { createContentService } from "../modules/content/content.service.js";

/**
 * Seed / reset the storefront Footer content (the `FooterContent` singleton)
 * with Planet of Toys defaults that match the approved footer layout. This is a
 * one-time convenience: everything written here is fully editable afterwards in
 * Admin → Content → Footer Content. Re-running it overwrites the footer with
 * these defaults (idempotent upsert of the singleton).
 *
 * Run from the server workspace so dotenv picks up server/.env:
 *   npm run seed:footer --workspace=server
 */

const footer = {
  enabled: true,

  columns: [
    {
      title: "Shop & Explore",
      links: [
        { label: "New Arrivals", url: "/products?sort=new" },
        { label: "Shop by Age", url: "/products" },
        { label: "Educational Toys", url: "/products" },
        { label: "Arts & Crafts", url: "/products" },
        { label: "Pretend Play", url: "/products" },
        { label: "Brands", url: "/products" },
        { label: "Sale", url: "/products?sale=1" },
      ],
    },
    {
      title: "Customer Support",
      links: [
        { label: "Contact Us", url: "/contact-us" },
        { label: "FAQ", url: "/faq" },
        { label: "Track Order", url: "/track-order" },
        { label: "Shipping & Returns", url: "/shipping-policy" },
        { label: "Refund Policy", url: "/refund-policy" },
        { label: "Bulk Orders", url: "/bulk-orders" },
      ],
    },
    {
      title: "Planet of Toys",
      links: [
        { label: "Our Story", url: "/our-story" },
        { label: "Planet Care Program", url: "/planet-care" },
        { label: "Blog", url: "/blog" },
        { label: "Membership Benefits", url: "/membership" },
        { label: "Careers", url: "/careers" },
      ],
    },
    {
      title: "Partner With Us",
      links: [
        { label: "Become a Reseller", url: "/reseller" },
        { label: "Wholesale Orders", url: "/wholesale" },
        { label: "Corporate Gifting", url: "/corporate-gifting" },
        { label: "Schools & Institutions", url: "/institutions" },
        { label: "Affiliate Program", url: "/affiliate" },
      ],
    },
  ],

  newsletter: {
    enabled: true,
    title: "Join the Planet of Toys Club",
    subtitle:
      "Get exclusive offers, new arrivals, toy recommendations, parenting tips, and special updates.",
    placeholder: "Enter your email",
    buttonLabel: "Subscribe",
  },

  membershipPromo: {
    enabled: false,
    title: "Planet Families",
    description:
      "Unlock exclusive rewards, birthday benefits, and member-only offers.",
    buttonLabel: "Learn More",
    buttonUrl: "/membership",
  },

  social: [
    { platform: "facebook", url: "https://www.facebook.com/planetoftoys" },
    { platform: "twitter", url: "https://twitter.com/planetoftoys" },
    { platform: "instagram", url: "https://www.instagram.com/planetoftoys" },
    { platform: "youtube", url: "https://www.youtube.com/@planetoftoys" },
    { platform: "whatsapp", url: "https://wa.me/918368124434" },
  ],

  contact: {
    companyName: "Planet of Toys",
    address: "605, Block H3, Kunwar Singh Nagar, Nangloi, New Delhi 110041",
    phone: "+91 83681 24434",
    email: "info@planetoftoys.in",
    whatsapp: "+91 83681 24434",
    supportHours: "Mon–Sat, 10:00 AM – 7:00 PM",
  },

  trustHighlights: [
    { iconKey: "shield", title: "Safe & Trusted Products", subtitle: "Certified, child-safe toys" },
    { iconKey: "truck", title: "Pan-India Delivery", subtitle: "Fast shipping nationwide" },
    { iconKey: "lock", title: "Secure Payments", subtitle: "100% protected checkout" },
  ],

  bottomLinks: [
    { label: "Privacy Policy", url: "/privacy-policy" },
    { label: "Terms & Conditions", url: "/terms-of-service" },
    { label: "Refund Policy", url: "/refund-policy" },
    { label: "Shipping Policy", url: "/shipping-policy" },
  ],

  copyrightText: "© 2026 Planet of Toys. All rights reserved.",
};

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    // eslint-disable-next-line no-console
    console.error("MONGODB_URI is not set. Add it to server/.env and retry.");
    process.exit(1);
  }
  await connectDatabase(uri);
  const saved = await createContentService().updateFooter(footer);
  // eslint-disable-next-line no-console
  console.log(
    `Footer seeded: ${saved.columns.length} columns, ${saved.social.length} social links, ` +
      `${saved.trustHighlights.length} trust highlights. Edit anytime in Admin → Content → Footer Content.`
  );
  await disconnectDatabase();
  process.exit(0);
}

run().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error("Footer seed failed:", err?.message ?? err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
