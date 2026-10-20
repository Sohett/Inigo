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
  astro.config.mjs                 # adapter Vercel, site 100 % statique
  src/
    layouts/Base.astro             # <head>, SEO/OG, skip-link, classe .js (motion)
    pages/
      index.astro                  # assemble les sections + script reveal (IntersectionObserver)
      confidentialite.astro        # page RGPD (lien du footer)
    components/
      SiteHeader · Hero · Coach · Method · WhatsApp · Requirements · Demarrer · SiteFooter   (.astro, statiques)
      StartCta.astro               # CTA principal : WhatsApp sur mobile, #demarrer (QR) sur desktop
      Logo · PowerCurve · GrainOverlay   (.astro, visuels partagés)
    content/copy.ts                # TOUTE la copy FR (source unique), dont numéro + code d'accès
    lib/whatsapp-link.ts           # lien wa.me avec message prérempli
    styles/global.css              # tokens (clair/encre + aube signature), polices, motion
```

Flux de démarrage (INI-47) : l'athlète écrit en premier à Inigo sur WhatsApp, avec le code
d'accès dans un message prérempli (`wa.me/<numéro>?text=…`). Le coach crée alors l'athlète en
`onboarding` (INI-45). Sur mobile, les CTA ouvrent WhatsApp directement ; sur desktop, ils
descendent vers un QR (généré au build depuis le même lien, lib `qrcode`) pour que la
conversation se fasse sur le téléphone, avec un lien secondaire pour WhatsApp sur l'ordinateur.

**Numéro et code d'accès** : `whatsappContact` dans `copy.ts`. Le code doit rester celui saisi
dans l'admin du coach (Réglages, Onboarding) ; s'il change là-bas, le changer ici et redéployer.

## Conventions du service

- **Sections statiques en `.astro`** (zéro JS côté client hors reveal et navbar). Pas de
  framework d'îlots : la bascule mobile/desktop des CTA se fait en CSS (breakpoint `lg`).
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

## Tests

- `src/lib/whatsapp-link.spec.ts` : chiffres seuls dans le numéro, encodage du message, code
  d'accès présent dans le message de la landing, pas de tiret.
- `vitest.config.ts` : environnement `node`. `pnpm verify` doit passer.

## Ajouter / modifier une section

1. Édite la copy dans `src/content/copy.ts` (jamais de texte en dur dans les composants).
2. Crée/édite le composant `.astro` correspondant ; ajoute `class="reveal"` (+ `--delay`)
   pour l'apparition au scroll. Sections ancrées : `id` + `scroll-mt-20`.
3. Branche-le dans `src/pages/index.astro`.
4. `pnpm verify`.
