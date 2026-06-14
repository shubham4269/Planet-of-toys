// packages/shared-web/src/promoBanner/PromoBannerView.jsx
import { useEffect, useState } from "react";

/**
 * Pure presentational promotional header. Receives an already-prepared list of
 * announcements (filtering by date/device is the caller's job) and renders the
 * rotating bar: prev/next SVG arrows, per-slide colors, an optional clickable
 * link, an optional click-to-copy coupon chip, and an optional persistent
 * rightText slot. Auto-rotates when there is more than one slide and the user
 * has not requested reduced motion; pauses on hover/focus. Renders nothing when
 * there are no announcements. All icons are inline SVG (no icon fonts).
 *
 * @param {object} props
 * @param {Array} props.announcements  {id,text,url,couponCode,bgColor,textColor}
 * @param {string} [props.bgColor]     banner default background
 * @param {string} [props.textColor]   banner default text color
 * @param {number} [props.rotationIntervalMs=5000]
 * @param {string|null} [props.rightText]
 */
export default function PromoBannerView({
  announcements = [],
  bgColor = "#E11B22",
  textColor = "#FFFFFF",
  rotationIntervalMs = 5000,
  rightText = null,
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const count = announcements.length;

  // Keep the active index in range when the list shrinks.
  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  const reducedMotion =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return undefined;
    const interval = Math.max(2000, rotationIntervalMs);
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, interval);
    return () => clearInterval(id);
  }, [count, paused, reducedMotion, rotationIntervalMs]);

  if (count === 0) return null;

  const active = announcements[Math.min(index, count - 1)];
  const slideBg = active.bgColor || bgColor;
  const slideFg = active.textColor || textColor;

  function go(delta) {
    setIndex((i) => (i + delta + count) % count);
  }

  async function copyCoupon(code, id) {
    try {
      await globalThis.navigator?.clipboard?.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }

  return (
    <div
      className="promo-banner"
      role="region"
      aria-label="Promotional announcements"
      style={{ background: slideBg, color: slideFg }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {count > 1 && (
        <button
          type="button"
          className="promo-banner__nav promo-banner__nav--prev"
          aria-label="Previous announcement"
          onClick={() => go(-1)}
          style={{ color: slideFg }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div className="promo-banner__center" aria-live="polite">
        <span className="promo-banner__text">
          {active.url ? (
            <a href={active.url} className="promo-banner__link" style={{ color: slideFg }}>
              {active.text}
            </a>
          ) : (
            active.text
          )}
        </span>
        {active.couponCode && (
          <button
            type="button"
            className="promo-banner__coupon"
            onClick={() => copyCoupon(active.couponCode, active.id)}
            aria-label={`Copy coupon code ${active.couponCode}`}
          >
            <span className="promo-banner__coupon-code">{active.couponCode}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="promo-banner__coupon-status">
              {copiedId === active.id ? "Copied!" : "Copy"}
            </span>
          </button>
        )}
      </div>

      {count > 1 && (
        <button
          type="button"
          className="promo-banner__nav promo-banner__nav--next"
          aria-label="Next announcement"
          onClick={() => go(1)}
          style={{ color: slideFg }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {rightText && <span className="promo-banner__right">{rightText}</span>}
    </div>
  );
}
