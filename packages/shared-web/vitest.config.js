import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// JS utilities run in node; JSX View components need jsdom + the React plugin
// (automatic JSX runtime). We use jsdom for the whole package (the node-only
// utility tests pass under jsdom too) and include both .js and .jsx test files.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.{test,spec}.{js,jsx}"],
  },
});
