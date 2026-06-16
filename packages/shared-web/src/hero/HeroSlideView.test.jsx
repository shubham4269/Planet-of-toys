// packages/shared-web/src/hero/HeroSlideView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HeroSlideView from "./HeroSlideView.jsx";

afterEach(cleanup);
const base = { id: "s", title: "Summer Sale", subtitle: "Up to 50% off", ctaText: "Shop Now", ctaHref: "/collections/sale" };

describe("HeroSlideView (dispatch by displayMode)", () => {
  it("full_banner renders title, subtitle, and CTA link", () => {
    render(<HeroSlideView slide={{ ...base, displayMode: "full_banner", desktopMedia: "d.webp" }} resolveImageUrl={(f) => `/m/${f}`} />);
    expect(screen.getByText("Summer Sale")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop Now" })).toHaveAttribute("href", "/collections/sale");
  });

  it("split renders the media and the text block", () => {
    const { container } = render(<HeroSlideView slide={{ ...base, displayMode: "split", desktopMedia: "d.webp" }} resolveImageUrl={(f) => `/m/${f}`} />);
    expect(container.querySelector(".pot-hero-split")).not.toBeNull();
    expect(screen.getByText("Summer Sale")).toBeInTheDocument();
  });

  it("video renders a <video> with poster and an unmute toggle", () => {
    const { container } = render(<HeroSlideView slide={{ ...base, displayMode: "video", video: "v.mp4", posterImage: "p.webp" }} resolveImageUrl={(f) => `/m/${f}`} active />);
    expect(container.querySelector("video")).not.toBeNull();
    expect(screen.getByRole("button", { name: /unmute|mute/i })).toBeInTheDocument();
  });

  it("collection_grid renders the grid product cards", () => {
    render(<HeroSlideView slide={{ ...base, displayMode: "collection_grid", gridItems: [{ id: "p", slug: "x", name: "Blocks", price: 99, images: [] }] }} resolveImageUrl={(f) => `/m/${f}`} formatPrice={(n) => `Rs ${n}`} />);
    expect(screen.getByText("Blocks")).toBeInTheDocument();
  });

  it("event renders as a banner with the event class", () => {
    const { container } = render(<HeroSlideView slide={{ ...base, displayMode: "event", desktopMedia: "d.webp" }} resolveImageUrl={(f) => `/m/${f}`} />);
    expect(container.querySelector(".pot-hero--event")).not.toBeNull();
  });
});
