# Inigo — guide agents & contributeurs

**Inigo est un coach sportif.** Ce dépôt est un monorepo TypeScript qui regroupe ses
services : les services déployables vivent sous `apps/`, les packages partagés sous `libs/`.
Premier service livré : **`intervals-icu-mcp`** (d'autres suivront).

> Ce fichier est la **source de vérité des conventions pour les agents** (standard
> [`agents.md`](https://agents.md), lu par la plupart des outils). `CLAUDE.md` l'importe.
> Contexte humain (présentation, démarrage, déploiement) → `README.md`. Détails propres à
> un service → l'`AGENTS.md` / `README.md` de son dossier. Tiens ce fichier à jour quand les
> conventions transverses évoluent.

## Stack (transverse)

- **pnpm** workspaces + **Nx 23** (orchestration, cache des targets)
- **TypeScript 5.9** en mode strict (voir `tsconfig.base.json`)
- **zod 4** pour la validation (entrées + réponses API)
- **Vitest 4** + **msw 2** pour les tests
- **ESLint 10** + **typescript-eslint 8** (flat config)

Les dépendances propres à un service (Next.js, MCP SDK, …) sont documentées dans le dossier
de ce service.

## Layout

```
apps/        # services déployables
  intervals-icu-mcp/        # @inigo/intervals-icu-mcp — serveur MCP Intervals.icu
libs/        # packages partagés (@inigo/*)
  shared-config/            # @inigo/shared-config — schéma d'env (zod) + loader (transverse)
  intervals-icu-client/     # @inigo/intervals-icu-client — client REST Intervals.icu typé
  intervals-icu-mcp-tools/  # @inigo/intervals-icu-mcp-tools — définitions des tools MCP
```

Règle générale : la **logique métier** (appels API, parsing) vit dans les libs ; les apps
sont de fines couches d'exposition. `shared-config` est transverse à tout le monorepo.

## Commandes

Toujours via pnpm/Nx depuis la racine :

```bash
pnpm install                  # installer
pnpm verify                   # lint + typecheck + test sur tout (à lancer avant de commit)
pnpm test                     # tests seuls
pnpm typecheck                # types seuls
pnpm lint                     # lint seul
pnpm build                    # build de tous les projets

# Cibler un projet
pnpm nx <target> <projet>     # ex. pnpm nx test @inigo/intervals-icu-client
```

Les commandes propres à un service (ex. `pnpm dev:mcp`) sont documentées dans son dossier.

## Conventions

- **TS strict, pas de `any`** (`@typescript-eslint/no-explicit-any` en erreur).
  `noUncheckedIndexedAccess` activé : gère les `undefined` sur les accès indexés.
- **Imports relatifs sans extension** (`./client`, pas `./client.js`). Les sous-chemins
  de packages publiés gardent leur extension réelle (ex. `@modelcontextprotocol/sdk/server/mcp.js`).
  → Raison : le bundler de Next ne résout pas `.js`→`.ts` pour les packages workspace.
- **Naming** : symboles TS en `camelCase`/`PascalCase` ; packages en `@inigo/<nom-complet>`.
  Noms explicites, pas d'abréviations.
- **Validation zod** sur toutes les entrées (schémas d'input) et les réponses d'API externe.
- **Jamais de secret en clair** dans les logs, les sorties d'outils, ou le repo.

## Tests (exigences)

- Chaque package a ses tests Vitest co-localisés (`*.spec.ts`).
- Tout doit passer (`pnpm verify`) avant un commit.

Les exigences de test propres à un service (mocks, transports) sont dans son dossier.

## Sécurité (baseline)

- Secrets uniquement via **env serveur** — jamais dans un bundle client, jamais commités.
  `.env` est gitignore ; `.env.example` documente les variables.
- **Least privilege** : les capacités sensibles (écritures, etc.) sont désactivées par défaut
  et activées explicitement par flag.

## Services

- **intervals.icu (MCP)** — ajout/modif de tool, notes API, déploiement & Managed Agents :
  voir `apps/intervals-icu-mcp/AGENTS.md` (agents) et `apps/intervals-icu-mcp/README.md` (humains).
