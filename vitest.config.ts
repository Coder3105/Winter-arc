import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/mocks/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // bcrypt cost-12 checks can exceed Vitest's 5s default when 90+ files run in parallel.
    testTimeout: 15_000,
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
