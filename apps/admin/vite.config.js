import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Admin SPA (admin.planetoftoys.in). Runs on a distinct dev port from the
// storefront so both apps can run side by side during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    testTimeout: 30000,
  },
});
