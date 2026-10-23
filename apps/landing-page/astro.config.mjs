// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  // URL de prod (canonical + OG) : l'hôte servi, sans redirection. L'apex redirige (308) vers www,
  // et une og:image derrière une redirection ne s'affiche pas toujours (WhatsApp, LinkedIn).
  site: "https://www.inigo-coach.com",
  // Site 100 % statique (SSG), déployé via l'adapter Vercel.
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
