# landing-page — guide agents

Détails propres au service landing page. Les conventions transverses du monorepo (stack,
naming, imports sans extension, sécurité baseline, `pnpm verify`) sont dans l'`AGENTS.md`
racine. Présentation et déploiement côté humain : `README.md`.

**Direction artistique : design system Inigo v3** (canvas « Inigo · Site web », variante A3').
Fond papier `#fffdf9`, texte encre, IBM Plex Sans + Mono (self-hostées via `@fontsource`).
Accents : teal pour les petits tags mono, orange « effort » pour ce que le coach ajuste, vert
WhatsApp uniquement en pastille de CTA. Couleurs de zone Z1 à Z5 (pastel bordé dans les
graphiques). La copy (FR) est centralisée dans `src/content/` ; **aucun tiret `-` ni `—` dans
le texte visible** (vérifié par `copy.spec.ts`).

Le site vend la **vision** d'Inigo (hook, promesse) : la copy n'est pas limitée au périmètre
déjà construit côté coach (ex. objectif Marathon dans la démo).

## Architecture

```
apps/landing-page/
  astro.config.mjs                 # adapter Vercel, site 100 % statique
  src/
    layouts/Base.astro             # <head>, SEO/OG, skip link, classe .js (motion)
    pages/
      index.astro                  # assemble les sections, lance la démo + le reveal
      confidentialite.astro        # page RGPD (lien du footer)
    components/
      SiteHeader · Hero · PlanLive · Coach · Analysis · Science · RaceDay · Pricing · Start
      StartCta.astro               # CTA principal : WhatsApp sur mobile, #start (QR) sur desktop
      WhatsAppQr.astro             # QR généré au build depuis le lien wa.me
      MobileBar.astro              # barre CTA collante sous 768px
      Logo.astro
    content/
      copy.ts                      # copy FR des sections, numéro + code d'accès WhatsApp
      demo.ts                      # contenu de la démo : objectifs, imprévus, semaines types
    lib/
      plan-demo.ts                 # calcul pur : objectif × imprévu → plan, semaine, conversation
      plan-demo-view.ts            # rendus HTML partagés build / navigateur
      demo-controller.ts           # script client : rotation 6 s, clics, pause
      whatsapp-link.ts             # lien wa.me avec message prérempli
    styles/global.css              # tokens + composants du DS, classes de section, motion
```

## La démo interactive (hero + « Ton plan, en direct »)

- **Rendu complet au build** : `index.astro` calcule l'état initial (`planDemo`) et les
  composants l'injectent via les rendus de `plan-demo-view.ts`. Sans JS, la page est complète.
- **Côté navigateur**, `demo-controller.ts` rebascule l'état avec les **mêmes** fonctions de
  rendu (pas de duplication de markup) et met à jour les champs marqués `data-demo-*`.
- **Rotation** : imprévu suivant toutes les 6 s (`ROTATION_MS`). Un clic charge l'imprévu choisi
  et relance 6 s depuis lui ; le compteur « Réajustements » ne compte que les clics.
  Pause au survol des imprévus, au focus clavier, hors écran, ou via le bouton Pause (WCAG 2.2.2).
  Sous `prefers-reduced-motion`, rien ne tourne seul.
- **Ajouter un imprévu** : une entrée dans `scenarios` (`demo.ts`) avec ses messages et ses
  `changes` (séances réécrites par index de jour) ; un effet de volume au delà de la semaine en
  cours se déclare dans le `switch` de `weekVolume` (`plan-demo.ts`).

Flux de démarrage (INI-47) : l'athlète écrit en premier à Inigo sur WhatsApp, avec le code
d'accès dans un message prérempli (`wa.me/<numéro>?text=…`). Sur mobile, les CTA ouvrent WhatsApp
directement ; sur desktop, ils descendent vers le QR de « Démarrer » (`#start`), avec un lien
secondaire pour WhatsApp sur l'ordinateur.

**Numéro et code d'accès** : `whatsappContact` dans `copy.ts`. Le code doit rester celui saisi
dans l'admin du coach (Réglages, Onboarding) ; s'il change là-bas, le changer ici et redéployer.

## Conventions du service

- **Sections statiques en `.astro`**, CSS à plat dans `global.css` (pas de Tailwind, pas de
  framework d'îlots). Seul JS client : la démo et le reveal.
- **Bascule mobile/desktop** en CSS : `.only-mobile` / `.only-desktop` (breakpoint 1024px).
- **Motion** : transitions CSS + IntersectionObserver maison. Tout effet est neutralisé sous
  `prefers-reduced-motion`. Le reveal n'est actif que si JS l'est (classe `.js`).
- **Contraste AA** : labels mono en `--ig-muted` réservés aux libellés courts ; texte orange en
  `--ig-effort-text` (pas `--ig-effort`) sur fond clair. Exception voulue par le DS : les grands
  chiffres (24px et plus, ex. compteur « Réajustements », chrono du jour J) gardent `--ig-effort`,
  conforme AA grand texte (3:1).

## Tests

- `src/lib/plan-demo.spec.ts` : chaque objectif × imprévu (barres, phases, semaine ajustée,
  conversation), cas métier par imprévu.
- `src/lib/plan-demo-view.spec.ts` : échappement HTML des rendus.
- `src/content/copy.spec.ts` : pas de tiret dans la copy, ni dans aucun message de la démo.
- `src/lib/whatsapp-link.spec.ts` : lien wa.me, code d'accès dans le message.
- `vitest.config.ts` : environnement `node`. `pnpm verify` doit passer.

## Ajouter / modifier une section

1. Édite la copy dans `src/content/copy.ts` (jamais de texte en dur dans les composants).
2. Crée/édite le composant `.astro` ; ajoute `class="reveal"` (+ `--delay`) pour l'apparition
   au scroll. Section ancrée : `id` (le header compense via `scroll-padding-top`).
3. Branche-le dans `src/pages/index.astro`.
4. `pnpm verify`.
