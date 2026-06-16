// packages/shared-web/src/hero/layouts/HeroEvent.jsx
import HeroFullBanner from "./HeroFullBanner.jsx";
/** Event layout = full banner with an event style hook. */
export default function HeroEvent(props) {
  return <HeroFullBanner {...props} eventClass="pot-hero--event" />;
}
