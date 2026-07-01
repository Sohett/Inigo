# Inigo — guide agents & contributeurs

**Inigo est un coach sportif.** Ce dépôt est un monorepo TypeScript qui regroupe ses
services : les services déployables vivent sous `apps/`.
Services : **`intervals-icu-mcp`** (serveur MCP), **`landing-page`** (Astro), **`coach`** (backend qui relie WhatsApp au coach).

> Ce fichier est la **source de vérité des conventions pour les agents** (standard
> [`agents.md`](https://agents.md), lu par la plupart des outils). `CLAUDE.md` l'importe.
> Contexte humain (présentation, démarrage, déploiement) → `README.md`. Détails propres à
> un service → l'`AGENTS.md` / `README.md` de son dossier. Tiens ce fichier à jour quand les
> conventions transverses évoluent.

## Stack (transverse)

- **pnpm** workspaces (orchestration via `pnpm -r run`)
- **TypeScript 5.9** en mode strict (voir `tsconfig.base.json`)
- **zod 4** pour la validation (entrées + réponses API)
- **Vitest 4** + **msw 2** pour les tests
- **ESLint 10** + **typescript-eslint 8** (flat config)

Les dépendances propres à un service (Next.js, MCP SDK, …) sont documentées dans le dossier
de ce service.

## Layout

```
apps/        # services déployables
  intervals-icu-mcp/   # @inigo/intervals-icu-mcp : serveur MCP Intervals.icu
  landing-page/        # @inigo/landing-page : landing one-page (Astro), leads WhatsApp
  coach/               # @inigo/coach : backend (Next.js), WhatsApp (OpenWA) vers le coach
```

Chaque service est autonome : logique métier, client API, tests dans son propre dossier.
Pas de `libs/` partagées à ce stade — tout vit dans le service qui en a besoin.

## Commandes

Depuis la racine :

```bash
pnpm install                  # installer
pnpm verify                   # lint + typecheck + test sur tout (à lancer avant de commit)
pnpm test                     # tests seuls
pnpm typecheck                # types seuls
pnpm lint                     # lint seul
pnpm build                    # build de tous les projets

# Cibler un service
pnpm --filter @inigo/intervals-icu-mcp run test
```

Raccourcis dev depuis la racine : `pnpm dev:mcp`, `pnpm dev:landing`, `pnpm dev:coach`. Le
reste des commandes propres à un service est documenté dans son dossier.

## Conventions

- **TS strict, pas de `any`** (`@typescript-eslint/no-explicit-any` en erreur).
  `noUncheckedIndexedAccess` activé : gère les `undefined` sur les accès indexés.
- **Imports relatifs sans extension** (`./client`, pas `./client.js`). Les sous-chemins
  de packages publiés gardent leur extension réelle (ex. `@modelcontextprotocol/sdk/server/mcp.js`).
  → Raison : le bundler de Next ne résout pas `.js`→`.ts`.
- **Naming** : symboles TS en `camelCase`/`PascalCase` ; packages en `@inigo/<nom-complet>`.
  Noms explicites, pas d'abréviations.
- **Validation zod** sur toutes les entrées (schémas d'input) et les réponses d'API externe.
- **Jamais de secret en clair** dans les logs, les sorties d'outils, ou le repo.

## Méthode de travail (agents)

- **Plan d'abord.** Toute tâche non triviale (3+ étapes ou décision d'archi) commence par
  un plan. Si ça dérape en cours de route, on s'arrête et on replanifie plutôt que de forcer.
- **Subagents pour la recherche.** Délègue exploration, recherche de code et analyse
  parallèle à des subagents pour garder le contexte principal propre — une tâche par subagent.
- **Vérifier avant de dire « fait ».** Aucune tâche n'est terminée sans preuve qu'elle
  marche : `pnpm verify` au vert, tests/logs à l'appui. Au moindre doute, compare le
  comportement avant/après.
- **Viser l'élégance, sans sur-ingénierie.** Sur un changement non trivial, se demander
  s'il existe plus simple. Pour un fix évident, ne pas en rajouter.
- **Bugs : autonome.** Face à un bug (log, erreur, test rouge), remonter à la cause racine
  et corriger — pas de rustine, pas de besoin de hand-holding.
- **Impact minimal.** Ne toucher que ce qui est nécessaire ; éviter les régressions.

## Tests (exigences)

- Tests Vitest co-localisés dans le service (`*.spec.ts`).
- Tout doit passer (`pnpm verify`) avant un commit.

Les exigences de test propres à un service (mocks, transports) sont dans son dossier.

## Sécurité (baseline)

- Secrets uniquement via **env serveur** — jamais dans un bundle client, jamais commités.
  `.env` est gitignore ; `.env.example` documente les variables.
- **Least privilege** : les capacités sensibles (écritures, etc.) sont désactivées par défaut
  et activées explicitement par flag.

## Services

Chaque service documente ses détails dans son `AGENTS.md` (agents) et `README.md` (humains) :

- **`intervals-icu-mcp`** : serveur MCP Intervals.icu (tools, notes API, déploiement, Managed Agents).
- **`landing-page`** : landing one-page Astro (capte des leads WhatsApp).
- **`coach`** : backend Next.js reliant WhatsApp (gateway OpenWA) au coach Managed Agent.
