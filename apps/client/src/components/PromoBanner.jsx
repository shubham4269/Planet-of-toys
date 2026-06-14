// apps/client/src/components/PromoBanner.jsx
import { useEffect, useState } from "react";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { PromoBannerView } from "@planet-of-toys/shared-web";
import "./PromoBanner.css";

/**
 * Storefront promotional header. Fetches the public banner, filters slides by
 * the current viewport (showOnMobile/showOnDesktop), and renders the shared
 * PromoBannerView so the bar looks identical to the admin live preview. Renders
 * nothing on fetch failure, when disabled, or when no slide targets this
 * device — it must never block or break the page.
 */
const MOBILE_QUERY = "(max-width: 768px)";

export default function PromoBanner() {
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get("/api/content/promo-banner")
      .then((res) => {
        if (active) setBanner(res?.banner ?? null);
      })
      .catch(() => {
        if (active) setBanner(null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!banner || !banner.enabled) return null;

  const isMobile =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia(MOBILE_QUERY).matches;

  const announcements = (banner.announcements ?? []).filter((a) =>
    isMobile ? a.showOnMobile : a.showOnDesktop
  );

  if (announcements.length === 0) return null;

  return (
    <PromoBannerView
      announcements={announcements}
      bgColor={banner.bgColor}
      textColor={banner.textColor}
      rotationIntervalMs={banner.rotationIntervalMs}
      rightText={banner.rightText}
    />
  );
}
