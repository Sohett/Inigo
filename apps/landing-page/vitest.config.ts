import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // Pas de specs sous src/pages (Astro y route tous les fichiers) : la logique testable
    // de l'endpoint vit dans src/lib/lead-handler.ts.
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
    },
  },
});
