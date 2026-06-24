# Inigo

**Inigo est un coach sportif.** Ce dépôt est le monorepo TypeScript qui regroupe ses
services. Le premier service livré expose les données d'entraînement [Intervals.icu](https://intervals.icu)
à des agents IA via le protocole MCP ; d'autres services suivront.

## Aperçu du monorepo

```
apps/    # services déployables
  intervals-icu-mcp/   # serveur MCP exposant Intervals.icu — voir son README
```

Outillage : **pnpm** workspaces, **TypeScript 5.9** strict, **Vitest 4**.

## Démarrage

Prérequis : **Node ≥ 20** et **pnpm** (`pnpm@10`).

```bash
pnpm install                                    # installer les dépendances
cp .env.example apps/intervals-icu-mcp/.env    # puis renseigner les valeurs
pnpm verify                                     # lint + typecheck + test sur tout le monorepo
```

Pour lancer un service en développement, voir son README (ex. `pnpm dev:mcp`).

## Services

| Service | Description | Doc |
|---|---|---|
| `intervals-icu-mcp` | Serveur MCP distant exposant Intervals.icu aux agents — <https://intervals-icu-mcp.inigo-coach.com> | [`apps/intervals-icu-mcp/README.md`](apps/intervals-icu-mcp/README.md) |

## Contribuer

Les conventions du repo (stack, commandes, style, tests, sécurité) sont décrites pour les
agents IA et les humains dans [`AGENTS.md`](AGENTS.md). Les détails propres à un service
vivent dans son dossier (`README.md` côté humain, `AGENTS.md` côté agent).
