/**
 * @planet-of-toys/shared-web — shared frontend utilities.
 *
 * Single source of truth for code consumed by BOTH the storefront (apps/client)
 * and admin (apps/admin) applications: the backend API client and the display
 * formatting helpers. App-specific concerns (Meta Pixel, UTM capture, admin
 * auth/session) deliberately live inside their owning app, not here.
 */

// API client: `apiClient` (default), plus `request`, `ApiError`, `API_BASE_URL`.
export { default } from "./apiClient.js";
export * from "./apiClient.js";

// Formatting helpers: `formatINR`, `mediaUrl`, `CURRENCY`.
export * from "./format.js";

// Promotional header presentational component (consumed by storefront + admin).
export { default as PromoBannerView } from "./promoBanner/PromoBannerView.jsx";

// Storefront footer presentational component (consumed by storefront + admin preview).
export { default as FooterView } from "./footer/FooterView.jsx";

// Catalog presentational components (storefront + admin preview).
export { default as CategoryView } from "./catalog/CategoryView.jsx";
export { default as CollectionView } from "./catalog/CollectionView.jsx";
export { default as AttributeFilterView } from "./catalog/AttributeFilterView.jsx";
export { default as ProductCard } from "./catalog/ProductCard.jsx";
export { default as ProductGrid } from "./catalog/ProductGrid.jsx";
export { default as SortControl, SORT_OPTIONS } from "./catalog/SortControl.jsx";
export { default as FilterView } from "./catalog/FilterView.jsx";
export * from "./catalog/filterParams.js";
