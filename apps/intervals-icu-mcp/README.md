# intervals-icu-mcp

Serveur **MCP** (Model Context Protocol) distant qui expose les données
[Intervals.icu](https://intervals.icu) à des agents — notamment les **Managed Agents d'Anthropic** via le MCP connector. C'est le premier service du monorepo Inigo (voir le [README racine](../../README.md)).

## Stack

- **Next.js 16** (App Router) héberge le serveur MCP
- **mcp-handler 1.1** (Vercel) — expose le MCP dans une route Next (`app/api/[transport]/route.ts`)
- **@modelcontextprotocol/sdk 1.26.0** — épinglé, exigé par `mcp-handler`
- S'appuie sur `@inigo/intervals-icu-client`, `@inigo/intervals-icu-mcp-tools`,
  `@inigo/shared-config`

L'endpoint MCP est exposé sur **`/api/mcp`** et protégé par un bearer token.

## Variables d'environnement

Validées au boot par `@inigo/shared-config` (échec explicite si invalide). Copie
`.env.example` (racine du repo) → `.env` **dans ce dossier** et renseigne :

| Variable | Rôle |
|---|---|
| `INTERVALS_API_KEY` | Clé API du compte Intervals.icu (Settings → Developer) |
| `INTERVALS_ATHLETE_ID` | Id de l'athlète (ex. `i123456`) |
| `MCP_BEARER_TOKEN` | Secret que le client MCP doit présenter (`openssl rand -hex 32`) |
| `INTERVALS_BASE_URL` | Optionnel — défaut `https://intervals.icu/api/v1` |

> Les secrets sont **server-side uniquement**, jamais commités, jamais exposés au client.

## Lancer en local

```bash
pnpm dev:mcp                                   # next dev (depuis la racine)
# ou
pnpm build && pnpm nx start intervals-icu-mcp  # build + start

# Vérifier l'endpoint (liste des tools) :
curl -X POST http://localhost:3000/api/mcp \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer $MCP_BEARER_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Déploiement & Managed Agents

1. L'app est déployée sur **Vercel** : <https://intervals-icu-mcp.inigo-coach.com>.
   Endpoint MCP : `https://intervals-icu-mcp.inigo-coach.com/api/mcp`.
   Env requis : `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`, `MCP_BEARER_TOKEN`.
2. Côté Managed Agents : créer un **vault** `static_bearer` (URL = l'endpoint MCP,
   token = `MCP_BEARER_TOKEN`), puis un **agent** déclarant `mcp_servers` + `mcp_toolset`,
   puis une **session** avec `vault_ids`.

## Contribuer

Architecture interne, ajout d'un tool MCP, conventions, tests et notes sur l'API
Intervals.icu : voir [`AGENTS.md`](AGENTS.md) dans ce dossier.
