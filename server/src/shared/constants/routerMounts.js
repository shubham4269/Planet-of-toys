/**
 * Canonical base paths for each feature router.
 *
 * Keeping these in one shared place lets the application factory mount routers
 * consistently, lets each module document where it is mounted, and lets tests
 * assert the contract. These paths are part of the public API surface and must
 * not change without a coordinated client + integration update.
 */
export const ROUTER_MOUNTS = Object.freeze({
  products: "/api/products",
  orders: "/api/orders",
  payment: "/api/payment",
  shipping: "/api/shipping",
  otp: "/api/otp",
  admin: "/api/admin",
  settings: "/api/admin/settings",
  webhooks: "/api/webhooks",
  media: "/api/media",
  config: "/api/config",
  contentAdmin: "/api/admin/content",
  content: "/api/content",
  newsletter: "/api/newsletter",
  newsletterAdmin: "/api/admin/newsletter",
  catalogAdmin: "/api/admin/catalog",
  catalog: "/api/catalog",
});

export default ROUTER_MOUNTS;
