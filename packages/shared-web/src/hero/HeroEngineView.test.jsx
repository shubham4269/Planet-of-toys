// packages/shared-web/src/hero/HeroEngineView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import HeroEngineView from "./HeroEngineView.jsx";

afterEach(cleanup);
const slides = [
  { id: "1", displayMode: "full_banner", title: "First", ctaText: "Go", ctaHref: "/a", desktopMedia: "1.webp" },
  { id: "2", displayMode: "full_banner", title: "Second", ctaText: "Go", ctaHref: "/b", desktopMedia: "2.webp" },
];

describe("HeroEngineView", () => {
  it("renders nothing when there are no slides", () => {
    const { container } = render(<HeroEngineView slides={[]} />);
    expect(container.querySelector(".pot-hero-carousel")).toBeNull();
  });

  it("renders all slides in the DOM (SEO) and marks the first active", () => {
    const { container } = render(<HeroEngineView slides={slides} autoPlay={false} resolveImageUrl={(f) => `/m/${f}`} />);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(container.querySelectorAll(".pot-hero-carousel__slide--active")).toHaveLength(1);
  });

  it("advances to the next slide on the next control", () => {
    const { container } = render(<HeroEngineView slides={slides} autoPlay={false} resolveImageUrl={(f) => `/m/${f}`} />);
    fireEvent.click(screen.getByRole("button", { name: /next slide/i }));
    expect(container.querySelector(".pot-hero-carousel__slide--active").textContent).toContain("Second");
  });

  it("jumps to a slide via its dot", () => {
    const { container } = render(<HeroEngineView slides={slides} autoPlay={false} resolveImageUrl={(f) => `/m/${f}`} />);
    fireEvent.click(screen.getByRole("tab", { name: /go to slide 2/i }));
    expect(container.querySelector(".pot-hero-carousel__slide--active").textContent).toContain("Second");
  });
});
