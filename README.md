# Inigo

**Inigo est un coach sportif.** Ce dépôt est le monorepo TypeScript qui regroupe ses
services : un serveur MCP qui expose les données [Intervals.icu](https://intervals.icu) aux
agents IA, une landing page, et le backend qui relie WhatsApp au coach (Managed Agent).

## Aperçu du monorepo

```
apps/    # services déployables
  intervals-icu-mcp/   # serveur MCP exposant Intervals.icu aux agents
  landing-page/        # landing page one-page (Astro) qui capte des leads WhatsApp
  coach/         # backend (Next.js) reliant WhatsApp (OpenWA) au coach Managed Agent
```

Outillage : **pnpm** workspaces, **TypeScript 5.9** strict, **Vitest 4**.

## Démarrage

Prérequis : **Node ≥ 20** et **pnpm** (`pnpm@10`).

```bash
pnpm install                                    # installer les dépendances
# pour chaque service à lancer, copie son .env.example → .env (voir son README)
pnpm verify                                     # lint + typecheck + test sur tout le monorepo
```

Pour lancer un service en développement, voir son README (ex. `pnpm dev:mcp`).

## Services

| Service | Description | Doc |
|---|---|---|
| `intervals-icu-mcp` | Serveur MCP distant exposant Intervals.icu aux agents — <https://intervals-icu-mcp.inigo-coach.com> | [`apps/intervals-icu-mcp/README.md`](apps/intervals-icu-mcp/README.md) |
| `landing-page` | Landing page one-page (Astro) — présente le coach et capte un numéro WhatsApp | [`apps/landing-page/README.md`](apps/landing-page/README.md) |
| `coach` | Backend (Next.js) reliant WhatsApp (gateway OpenWA) au coach Managed Agent | [`apps/coach/README.md`](apps/coach/README.md) |

## Contribuer

Les conventions du repo (stack, commandes, style, tests, sécurité) sont décrites pour les
agents IA et les humains dans [`AGENTS.md`](AGENTS.md). Les détails propres à un service
vivent dans son dossier (`README.md` côté humain, `AGENTS.md` côté agent).
