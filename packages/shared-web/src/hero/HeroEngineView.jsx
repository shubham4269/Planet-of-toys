// packages/shared-web/src/hero/HeroEngineView.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import HeroSlideView from "./HeroSlideView.jsx";

/**
 * HeroEngineView — accessible hero carousel. Pure/presentational: takes resolved
 * `slides` + `resolveImageUrl`/`formatPrice`. Autoplay (default 4s) pauses on
 * hover and when the tab is hidden, and is disabled under prefers-reduced-motion.
 * All slides stay in the DOM (SEO); only the active one is shown (CSS). Supports
 * dots, prev/next, left/right keys, and touch swipe.
 */
export default function HeroEngineView({ slides = [], resolveImageUrl, formatPrice, autoPlay = true, intervalMs = 4000 }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const count = slides.length;

  const go = useCallback((i) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  const reduced = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!autoPlay || reduced || paused || count <= 1) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [autoPlay, reduced, paused, count, intervalMs]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (count === 0) return null;

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  };
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -40) next(); else if (dx > 40) prev();
    touchX.current = null;
  };

  return (
    <section className="pot-hero-carousel" aria-roledescription="carousel" aria-label="Promotions"
      tabIndex={0} onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {count > 1 && <button type="button" className="pot-hero-carousel__arrow pot-hero-carousel__arrow--prev" aria-label="Previous slide" onClick={prev}>‹</button>}
      {slides.map((slide, i) => (
        <div key={slide.id} className={`pot-hero-carousel__slide${i === index ? " pot-hero-carousel__slide--active" : ""}`}
          aria-hidden={i === index ? undefined : true} aria-roledescription="slide" aria-label={`${i + 1} of ${count}`}>
          <HeroSlideView slide={slide} resolveImageUrl={resolveImageUrl} formatPrice={formatPrice} active={i === index} eager={i === 0} />
        </div>
      ))}
      {count > 1 && <button type="button" className="pot-hero-carousel__arrow pot-hero-carousel__arrow--next" aria-label="Next slide" onClick={next}>›</button>}
      {count > 1 && (
        <div className="pot-hero-carousel__dots" role="tablist">
          {slides.map((slide, i) => (
            <button key={slide.id} type="button" role="tab" aria-selected={i === index}
              className={`pot-hero-carousel__dot${i === index ? " pot-hero-carousel__dot--active" : ""}`}
              aria-label={`Go to slide ${i + 1}`} onClick={() => go(i)} />
          ))}
        </div>
      )}
    </section>
  );
}
