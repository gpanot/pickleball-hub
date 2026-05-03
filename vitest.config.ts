import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000, // 30s — API calls to Claude can be slow
    hookTimeout: 15000,
    setupFiles: ["./src/tests/setup.ts"],
  },
});
