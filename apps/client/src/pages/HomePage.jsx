// apps/client/src/pages/HomePage.jsx
import HeroEngine from "../components/HeroEngine.jsx";
import "./HomePage.css";

/**
 * Storefront homepage. The Hero Engine is ONE section; the remaining sections are
 * placeholders today and will be built in later sub-projects (homepage
 * merchandising). Keeping this wrapper lets the homepage grow without touching
 * the hero.
 */
const FUTURE_SECTIONS = [
  "Shop By Age", "Shop By Category", "Best Sellers", "New Arrivals",
  "Featured Collections", "Reviews", "Why Choose Us",
];

export default function HomePage() {
  return (
    <main className="home">
      <section className="home__section home__hero" aria-label="Highlights">
        <HeroEngine />
      </section>
      {FUTURE_SECTIONS.map((label) => (
        <section key={label} className="home__section home__placeholder" aria-label={label}>
          <h2 className="home__heading">{label}</h2>
          <p className="home__soon">Coming soon</p>
        </section>
      ))}
    </main>
  );
}
