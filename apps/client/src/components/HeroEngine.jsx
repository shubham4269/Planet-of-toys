// apps/client/src/components/HeroEngine.jsx
import { useEffect, useState } from "react";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { HeroEngineView } from "@planet-of-toys/shared-web";
import "@planet-of-toys/shared-web/hero/hero-views.css";

/**
 * Homepage Hero section — fetches the public hero slides and renders the shared
 * HeroEngineView. Renders nothing when there are no active slides.
 */
export default function HeroEngine() {
  const [slides, setSlides] = useState([]);
  useEffect(() => {
    let active = true;
    apiClient.get("/api/hero")
      .then((res) => { if (active) setSlides(res.slides || []); })
      .catch(() => { if (active) setSlides([]); });
    return () => { active = false; };
  }, []);
  if (!slides.length) return null;
  return <HeroEngineView slides={slides} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />;
}
