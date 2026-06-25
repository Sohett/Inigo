# landing-page

Landing page **one-page** d'Inigo (FR) : présente le coach, sa méthode, et capte un
**numéro WhatsApp** via un formulaire. Direction artistique **claire & épurée**, accent encre
(noir profond) ; la couleur « aube alpine » est réservée au visuel signature du hero (dégradé
+ grain + courbe de puissance). C'est un service du monorepo Inigo (voir le
[README racine](../../README.md)).

## Stack

- **Astro 7** (sortie statique / SSG) + **React 19** pour les îlots interactifs
- **Tailwind CSS v4** (config CSS-first via `@theme` dans `src/styles/global.css`,
  `@tailwindcss/vite`) + primitives **shadcn** (`base-nova` sur `@base-ui/react`)
- **Polices self-hostées** via `@fontsource-variable` (Schibsted Grotesk, Hanken Grotesk, Geist Mono)
- **zod 4** (schéma de lead partagé client/serveur), **react-hook-form** + **libphonenumber-js**
- **Adapter `@astrojs/vercel`** : tout est statique sauf la route `/api/lead` (rendue à la demande)

Seul l'endpoint `/api/lead` est dynamique ; il transmet le lead à un **webhook externe**
(pas de base de données, pas d'email — voir ci-dessous).

## Variables d'environnement

Serveur uniquement, typées via `astro:env` (cf. `astro.config.mjs`). Copie `.env.example` →
`.env` **dans ce dossier** :

| Variable | Rôle |
|---|---|
| `LEAD_WEBHOOK_URL` | Webhook qui reçoit chaque lead en JSON (n8n / Make / Zapier / WhatsApp…). Pour tester en local : une URL `https://webhook.site/<id>`. |
| `LEAD_WEBHOOK_SECRET` | Optionnel — secret partagé envoyé en en-tête `x-webhook-secret`. |

> Sans `LEAD_WEBHOOK_URL` : en dev, le lead est loggé (numéro masqué) et l'envoi est
> considéré OK ; en production, l'absence d'URL fait échouer la route (500). Les secrets sont
> server-side uniquement, jamais commités.

Le webhook reçoit : `{ firstName?, phone (E.164), consent, source: "landing-page", createdAt }`.

## Lancer en local

```bash
pnpm dev:landing                  # astro dev (depuis la racine) → http://localhost:4321
# ou
pnpm --filter @inigo/landing-page dev

# Tester l'endpoint lead :
curl -X POST http://localhost:4321/api/lead \
  -H "content-type: application/json" \
  -d '{"phone":"+32470123456","consent":true}'
```

## Déploiement

Déployée sur **Vercel** (adapter `@astrojs/vercel`). `pnpm build` (racine) construit la LP
via `pnpm -r run build`. Configurer `LEAD_WEBHOOK_URL` (et éventuellement `LEAD_WEBHOOK_SECRET`)
côté Vercel. Le domaine final est à confirmer ; `site` dans `astro.config.mjs` doit refléter
l'URL de prod (canonical + OG).

> L'image OG est servie en **PNG** (`public/og.png`, 1200×630) pour la compatibilité avec les
> réseaux sociaux (WhatsApp, etc. ne rendent pas les SVG en aperçu). Le source vectoriel
> éditable est `public/og.svg` ; après modification, re-rasteriser en PNG. Icône d'écran
> d'accueil iOS : `public/apple-touch-icon.png` (180×180).

## Contribuer

Architecture interne, conventions de composants/îlots, formulaire et tests : voir
[`AGENTS.md`](AGENTS.md) dans ce dossier.
