// packages/shared-web/src/hero/HeroSlideView.jsx
import HeroFullBanner from "./layouts/HeroFullBanner.jsx";
import HeroSplit from "./layouts/HeroSplit.jsx";
import HeroVideo from "./layouts/HeroVideo.jsx";
import HeroCollectionGrid from "./layouts/HeroCollectionGrid.jsx";
import HeroEvent from "./layouts/HeroEvent.jsx";

/**
 * HeroSlideView — renders ONE slide by its `displayMode`. Pure; the consumer
 * supplies CSS, `resolveImageUrl`, `formatPrice`. `active` (video play/pause) and
 * `eager` (LCP image) are passed through by the carousel engine.
 */
export default function HeroSlideView({ slide, resolveImageUrl, formatPrice, active = true, eager = false }) {
  if (!slide) return null;
  const props = { slide, resolveImageUrl, formatPrice, active, eager };
  switch (slide.displayMode) {
    case "split": return <HeroSplit {...props} />;
    case "video": return <HeroVideo {...props} />;
    case "collection_grid": return <HeroCollectionGrid {...props} />;
    case "event": return <HeroEvent {...props} />;
    case "full_banner":
    default: return <HeroFullBanner {...props} />;
  }
}
