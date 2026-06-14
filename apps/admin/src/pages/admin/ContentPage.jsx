import { Outlet } from "react-router-dom";
import "./ContentPage.css";

/**
 * Admin Content section layout. Hosts the active content sub-page via <Outlet>
 * (Promotional Banner now; Hero Slider, etc. later).
 */
export default function ContentPage() {
  return (
    <section className="content-page">
      <Outlet />
    </section>
  );
}
