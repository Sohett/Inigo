# Inigo

**Inigo est un coach sportif.** Ce dépôt est le monorepo TypeScript qui regroupe ses
services : une landing page, et le backend qui relie WhatsApp au coach (Managed Agent) et
expose aux agents IA les serveurs MCP (donnée coaching + [Intervals.icu](https://intervals.icu)).

## Aperçu du monorepo

```
apps/    # services déployables
  landing-page/        # landing page one-page (Astro) qui capte des leads WhatsApp
  coach/         # backend (Next.js) : WhatsApp (OpenWA) → coach Managed Agent + serveurs MCP
```

Outillage : **pnpm** workspaces, **TypeScript 5.9** strict, **Vitest 4**.

## Démarrage

Prérequis : **Node ≥ 20** et **pnpm** (`pnpm@10`).

```bash
pnpm install                                    # installer les dépendances
# pour chaque service à lancer, copie son .env.example → .env (voir son README)
pnpm verify                                     # lint + typecheck + test sur tout le monorepo
```

Pour lancer un service en développement, voir son README (ex. `pnpm dev:coach`).

## Services

| Service | Description | Doc |
|---|---|---|
| `landing-page` | Landing page one-page (Astro) — présente le coach et capte un numéro WhatsApp | [`apps/landing-page/README.md`](apps/landing-page/README.md) |
| `coach` | Backend (Next.js) reliant WhatsApp (gateway OpenWA) au coach Managed Agent ; héberge les trois serveurs MCP coaching-data (`/api/coaching-data/mcp`), Intervals.icu (`/api/intervals/mcp`) et WhatsApp (`/api/whatsapp/mcp`) | [`apps/coach/README.md`](apps/coach/README.md) |

## Contribuer

Les conventions du repo (stack, commandes, style, tests, sécurité) sont décrites pour les
agents IA et les humains dans [`AGENTS.md`](AGENTS.md). Les détails propres à un service
vivent dans son dossier (`README.md` côté humain, `AGENTS.md` côté agent).
