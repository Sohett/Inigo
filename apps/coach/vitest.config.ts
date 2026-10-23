import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Next's tsconfig keeps JSX as is (`preserve`) for its own compiler; component tests need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["proxy.spec.ts", "src/**/*.spec.ts", "app/**/*.spec.ts", "app/**/*.spec.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "app/**/*.ts", "app/**/*.tsx"]
    }
  }
});
