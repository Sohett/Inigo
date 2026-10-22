// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  // URL de prod (canonical + OG). À ajuster si le domaine final diffère.
  site: "https://inigo-coach.com",
  // Site 100 % statique (SSG), déployé via l'adapter Vercel.
  adapter: vercel(),
});
