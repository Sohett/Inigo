// @ts-check
import { defineConfig, envField } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  // URL de prod (canonical + OG). À ajuster si le domaine final diffère.
  site: "https://inigo-coach.com",
  // Site statique (SSG) ; seules les routes marquées `prerender = false`
  // (ex. /api/lead) sont rendues à la demande via l'adapter Vercel.
  adapter: vercel(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Secrets serveur typés (importés depuis `astro:env/server`). Jamais exposés au client.
  env: {
    schema: {
      LEAD_WEBHOOK_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      LEAD_WEBHOOK_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },
});
