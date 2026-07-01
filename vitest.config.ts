import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Node by default (fast — most tests are pure logic). Component tests opt
    // into a DOM with a `// @vitest-environment jsdom` docblock per file.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Integration tests need a real DB and run via vitest.integration.config.ts.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Only report on source we actually author + could test. Exclude the
      // generated Prisma client, route/config scaffolding, type-only and test
      // files so the numbers reflect real logic coverage.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/generated/**",
        "src/routeTree.gen.ts",
        "src/**/*.d.ts",
      ],
    },
  },
});
