# landing-page — guide agents

Détails propres au service landing page. Les conventions transverses du monorepo (stack,
naming, imports sans extension, sécurité baseline, `pnpm verify`) sont dans l'`AGENTS.md`
racine. Présentation et déploiement côté humain : `README.md`.

**Direction artistique : clair & épuré, accent encre.** Base canvas (blanc froid), texte et
boutons en encre (noir profond, token `encre`), pas de vert. La couleur « aube alpine »
(bleu nuit → rose alpenglow → ambre) ne vit que dans le **visuel signature** du hero (dégradé
`aube-gradient` + grain + courbe de puissance). La copy (FR) est centralisée dans
`src/content/copy.ts` ; **aucun tiret `-` ni `—` dans le texte visible**.

## Architecture

```
apps/landing-page/
  astro.config.mjs                 # adapter Vercel + schéma astro:env (secrets serveur)
  src/
    layouts/Base.astro             # <head>, SEO/OG, skip-link, classe .js (motion)
    pages/
      index.astro                  # assemble les sections + script reveal (IntersectionObserver)
      confidentialite.astro        # page RGPD (lien du footer)
      api/lead.ts                  # POST /api/lead (prerender = false) — wrapper fin
    lib/lead-handler.ts            # logique du endpoint (testable hors routing Astro)
    components/
      SiteHeader · Hero · Coach · Method · WhatsApp · Requirements · Demarrer · SiteFooter   (.astro, statiques)
      Logo · PowerCurve · GrainOverlay   (.astro, visuels partagés)
      lead-form.tsx                # ÎLOT React (react-hook-form + zodResolver + sonner)
      ui/                          # primitives (button, input, label, phone-input, sonner)
    content/copy.ts                # TOUTE la copy FR (source unique)
    lib/
      lead-schema.ts               # zod, partagé client + serveur
      phone.ts                     # normalisation E.164 (libphonenumber-js, défaut BE)
      notify.ts                    # notifyNewLead() → POST webhook
      rate-limit.ts                # garde anti-spam best-effort (in-memory)
    styles/global.css              # tokens (clair/encre + aube signature), polices, motion
```

Flux du lead : `lead-form.tsx` (client) → `POST /api/lead` → `lead-schema` (zod) → honeypot →
rate-limit → `phone` (E.164) → `notify` (webhook). Schéma zod **partagé** client/serveur.

## Conventions du service

- **Sections statiques en `.astro`** (zéro JS). React (`.tsx`) **uniquement** pour
  l'interactif : ici le seul îlot est `lead-form.tsx`, hydraté `client:visible`.
- **Couleurs** : toute la page est claire (token `background` = canvas). Accent fonctionnel
  = `encre` (boutons `bg-encre`, texte `text-foreground`/`text-encre-soft`, focus
  `ring-encre`). **Pas de vert, pas d'aplat de couleur** : nuit/indigo/alpenglow/ambre/glacier
  servent uniquement au dégradé signature (`aube-gradient`, texte `text-glacier` par-dessus).
- **Contraste AA** : texte encre (`text-foreground`) ou `text-encre-soft` sur clair ; texte
  glacier sur le dégradé signature (scrim implicite via le grain + l'opacité de l'aire).
- **Navbar** : transparente en haut, verre clair au scroll (classe `.is-scrolled` togglée
  par le `<script>` de `SiteHeader.astro` ; styles `.site-header` dans `global.css`).
- **Motion** : transitions CSS + IntersectionObserver maison, pas de lib. Tout effet est
  neutralisé sous `prefers-reduced-motion`. Le reveal n'est actif que si JS l'est (classe
  `.js` posée par `Base.astro`) → sans JS, le contenu reste visible.
- **Élément signature** : `PowerCurve.astro` — courbe puissance/durée (façon
  Garmin/Intervals.icu), tracée une fois (`.draw-stroke`, `pathLength="1000"`), posée sur le
  dégradé du hero avec grain.
- **Téléphone** : `ui/phone-input.tsx` (sur `react-phone-number-input`) — sélecteur de pays
  + numéro, sortie E.164, défaut BE. Branché via `Controller` dans `lead-form.tsx`.

## Formulaire & route

- `leadSchema` : `firstName?` (≤60, trim), `phone` (string non vide), `consent` (true requis),
  `_hp` (honeypot). La **validité E.164** du numéro est vérifiée côté serveur via `phone.ts`
  (le schéma ne valide que la forme).
- `POST /api/lead` : `400` payload/consentement, honeypot rempli → `200` **sans** transmettre,
  `429` rate-limit, numéro invalide → `400`, sinon `notifyNewLead` → `200` (ou `500`).
- **Jamais** logguer le numéro en clair ailleurs que dans le payload du webhook.
- Rate-limit `rate-limit.ts` : best-effort en mémoire (non partagé en serverless) — la défense
  principale reste le honeypot. Brancher Upstash derrière la même fonction si besoin.

## Tests

- `src/lib/lead-schema.spec.ts` : payloads valides/invalides (consent, longueur prénom).
- `src/lib/phone.spec.ts` : E.164 (BE par défaut + international), rejets.
- `src/lib/lead-handler.spec.ts` : logique du endpoint avec `notify` mocké
  (`vi.mock("@/lib/notify")`, car `notify` importe `astro:env/server`). Couvre
  valide/numéro invalide/honeypot/consentement/JSON illisible.
- `vitest.config.ts` : environnement `node`. `pnpm verify` doit passer.

## Ajouter / modifier une section

1. Édite la copy dans `src/content/copy.ts` (jamais de texte en dur dans les composants).
2. Crée/édite le composant `.astro` correspondant ; ajoute `class="reveal"` (+ `--delay`)
   pour l'apparition au scroll. Sections ancrées : `id` + `scroll-mt-20`.
3. Branche-le dans `src/pages/index.astro`.
4. `pnpm verify`.
