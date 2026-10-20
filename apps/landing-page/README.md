# landing-page

Landing page **one-page** d'Inigo (FR) : présente le coach, sa méthode, et emmène l'athlète
sur **WhatsApp** avec le code d'accès prérempli (QR sur desktop). Direction artistique **claire & épurée**, accent encre
(noir profond) ; la couleur « aube alpine » est réservée au visuel signature du hero (dégradé
+ grain + courbe de puissance). C'est un service du monorepo Inigo (voir le
[README racine](../../README.md)).

## Stack

- **Astro 7**, site 100 % statique (SSG), sans framework d'îlots
- **Tailwind CSS v4** (config CSS-first via `@theme` dans `src/styles/global.css`,
  `@tailwindcss/vite`)
- **Polices self-hostées** via `@fontsource-variable` (Schibsted Grotesk, Hanken Grotesk, Geist Mono)
- **`qrcode`** : QR WhatsApp généré au build (SVG), zéro JS côté client
- **Adapter `@astrojs/vercel`**

Aucune variable d'environnement : le numéro WhatsApp et le code d'accès vivent dans
`src/content/copy.ts` (`whatsappContact`). Le code doit rester aligné sur celui de l'admin du
coach.

## Lancer en local

```bash
pnpm dev:landing                  # astro dev (depuis la racine) → http://localhost:4321
# ou
pnpm --filter @inigo/landing-page dev
```

## Déploiement

Déployée sur **Vercel** (adapter `@astrojs/vercel`). `pnpm build` (racine) construit la LP
via `pnpm -r run build`. Le domaine final est à confirmer ; `site` dans `astro.config.mjs` doit refléter
l'URL de prod (canonical + OG).

> L'image OG est servie en **PNG** (`public/og.png`, 1200×630) pour la compatibilité avec les
> réseaux sociaux (WhatsApp, etc. ne rendent pas les SVG en aperçu). Le source vectoriel
> éditable est `public/og.svg` ; après modification, re-rasteriser en PNG. Icône d'écran
> d'accueil iOS : `public/apple-touch-icon.png` (180×180).

## Contribuer

Architecture interne, conventions de composants, CTA WhatsApp et tests : voir
[`AGENTS.md`](AGENTS.md) dans ce dossier.
