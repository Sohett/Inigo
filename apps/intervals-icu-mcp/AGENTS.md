# intervals-icu-mcp — guide agents

Détails propres au service MCP Intervals.icu. Les conventions transverses du monorepo
(stack, naming, imports, sécurité baseline, `pnpm verify`) sont dans l'`AGENTS.md` racine —
ne les recopie pas ici. Présentation et déploiement côté humain : `README.md` (ce dossier).

## Architecture

```
apps/intervals-icu-mcp/
  app/api/[transport]/route.ts     # Endpoint MCP (createMcpHandler + withMcpAuth)
  app/{layout,page}.tsx            # Landing minimale
  src/auth.ts                      # Vérif bearer à temps constant
  src/deps.ts                      # Config + client (singleton lazy)
  src/config/                      # Schéma d'env (zod) + loadConfig()
  src/client/                      # Client REST Intervals.icu typé (avec retry/timeout)
  src/mcp-tools/                   # Enregistrement des tools MCP
    index.ts                       # registerIntervalsIcuTools()
    result.ts                      # runTool, jsonResult, errorResult, dateRangeShape
    tools/                         # Un fichier par domaine (athlete, activities, …)
```

Flux : `route.ts` → `mcp-tools` → `client` → API Intervals.icu.
La **logique métier** (appels API, parsing, retry) vit dans `src/client/` ;
les **tools** sont de fines couches `input zod → client → sortie MCP`.

## Conventions MCP

- **Tools nommés en `snake_case`** (les symboles TS restent `camelCase`/`PascalCase`).
- Enregistrer un tool via `server.registerTool(name, { title, description, inputSchema }, handler)`.
- Encapsuler l'appel client dans `runTool(() => client.xxx())` pour la gestion uniforme
  succès/erreur.
- Les **tools d'écriture** (events) ne sont enregistrés que si `options.enableWriteTools`
  (mappé sur `ENABLE_WRITE_TOOLS`, défaut off — least privilege).

## Ajouter un nouveau tool MCP

1. Ajoute la méthode dans `src/client/client.ts` (+ schéma zod dans `schemas.ts`) et un
   test msw dans `client.spec.ts`.
2. Crée/édite le fichier de domaine sous `src/mcp-tools/tools/` et enregistre le tool
   (`registerTool` + `runTool`, cf. conventions ci-dessus).
3. Branche le `register*` dans `src/mcp-tools/index.ts`. Si c'est une **écriture**,
   ajoute-le dans le bloc gardé par `options.enableWriteTools`.
4. Ajoute le nom du tool à l'assertion de `src/mcp-tools/index.spec.ts`.
5. `pnpm verify`.

## Tests

- `src/client/client.spec.ts` : **msw** mocke l'API Intervals (auth, params, erreurs, parsing).
- `src/mcp-tools/index.spec.ts` : test d'intégration MCP via **`InMemoryTransport`**
  (list + call avec un client mocké).
- `src/auth.spec.ts` : `auth.ts` unitaire + rejet **401** sur la route.

## Sécurité

- L'endpoint MCP est protégé par bearer (`withMcpAuth`, comparaison à temps constant via
  `node:crypto.timingSafeEqual` dans `src/auth.ts`).
- Le client borne timeouts + retries et ne réémet jamais la clé API dans ses erreurs.

## API Intervals.icu (notes)

La spec OpenAPI officielle est versionnée et exposée via le skill **`intervals-icu-api`**
(`.claude/skills/intervals-icu-api/`, spec dans `reference/openapi.json`). **Avant
d'ajouter/modifier un endpoint, consulte ce skill** (recettes de requête incluses) plutôt
que de deviner. Endpoints ci-dessous vérifiés contre cette spec.

- Base URL : `https://intervals.icu/api/v1`. Auth : **HTTP Basic**, username littéral
  `API_KEY`, password = la clé API du compte.
- **Courbes** : endpoints au **pluriel** `/athlete/{id}/power-curves`, `/hr-curves`,
  `/pace-curves`. Le paramètre **`type` (sport) est requis** ; `curves` (durées) et
  `newest` sont optionnels. Pas de `oldest`.
- **`get_activities`** : `oldest` est requis par l'API → le tool met par défaut les
  30 derniers jours si non fourni.
- **`delete_events_by_range`** : `category` (array) est requis par l'API (garde-fou
  contre la suppression de tout le calendrier).
- **Arrays en query** (`curves`, `category`, `types`) : encodés en paramètres répétés.
