import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.js", "test/**/*.{test,spec}.js"],
    // Property-based tests (fast-check) can run many iterations; allow headroom.
    testTimeout: 30000,
  },
});
