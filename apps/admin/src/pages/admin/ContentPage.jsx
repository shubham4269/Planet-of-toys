// apps/admin/src/pages/admin/ContentPage.jsx
import PromoBannerEditor from "./PromoBannerEditor.jsx";
import "./ContentPage.css";

/**
 * Admin Content section. Container for storefront content management. For now it
 * hosts the Promotional Header editor; future content types (Hero Sliders,
 * Homepage Sections, Membership Promotions, Footer Content) become additional
 * sections/tabs here.
 */
export default function ContentPage() {
  return (
    <section className="content-page">
      <PromoBannerEditor />
    </section>
  );
}
