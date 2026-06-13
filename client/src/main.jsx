import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import pixel from "./lib/pixel.js";

// Load the Meta Pixel with the admin-configured id and fire the initial
// PageView (Req 3.1, 3.4). Fire-and-forget: tracking must never block render.
void pixel.bootstrap();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
