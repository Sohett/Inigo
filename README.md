# Inigo

**Inigo est un coach sportif.** Ce dépôt est le monorepo TypeScript qui regroupe ses
services. Le premier service livré expose les données d'entraînement [Intervals.icu](https://intervals.icu)
à des agents IA via le protocole MCP ; d'autres services suivront.

## Aperçu du monorepo

```
apps/    # services déployables
  intervals-icu-mcp/   # serveur MCP exposant Intervals.icu — voir son README
libs/    # packages partagés (@inigo/*)
  shared-config/            # schéma d'environnement (zod) + loader, transverse
  intervals-icu-client/     # client REST Intervals.icu typé
  intervals-icu-mcp-tools/  # définitions des tools MCP
```

Outillage : **pnpm** workspaces + **Nx 23**, **TypeScript 5.9** strict, **Vitest 4**.

## Démarrage

Prérequis : **Node ≥ 20** et **pnpm** (`pnpm@10`).

```bash
pnpm install                 # installer les dépendances
cp .env.example .env         # puis renseigner les valeurs (voir le README du service)
pnpm verify                  # lint + typecheck + test sur tout le monorepo
```

Pour lancer un service en développement, voir son README (ex. `pnpm dev:mcp`).

## Services

| Service | Description | Doc |
|---|---|---|
| `intervals-icu-mcp` | Serveur MCP distant exposant Intervals.icu aux agents | [`apps/intervals-icu-mcp/README.md`](apps/intervals-icu-mcp/README.md) |

## Contribuer

Les conventions du repo (stack, commandes, style, tests, sécurité) sont décrites pour les
agents IA et les humains dans [`AGENTS.md`](AGENTS.md). Les détails propres à un service
vivent dans son dossier (`README.md` côté humain, `AGENTS.md` côté agent).
