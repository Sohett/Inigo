# coach — guide agents

Backend d'Inigo (Next.js full-stack, Vercel). Complète l'`AGENTS.md` racine. Contexte
humain / déploiement / setup : `README.md`.

## Rôle & principe

App **full-stack unique** : le **backend** (route handlers `app/api/*` + logique `src/`) et,
plus tard, l'**admin** (pages sous `app/(admin)/…`) vivent ensemble. Aujourd'hui, une seule
capacité : **router** un message WhatsApp entrant vers la bonne session Managed Agent, résolue
par le `phone_num` de l'athlète en base (Neon).

Séparation nette du système : le **cerveau** tourne chez Anthropic (Managed Agents),
**WhatsApp** chez OpenWA/Railway. Cette app ne fait qu'**orchestrer** (stateless) → Vercel
convient. On sortira un service dédié (worker Railway) uniquement le jour où *notre* code
aura besoin de compute persistant (queue, batch long) — pas avant.

## Stack

- **Next.js 16** (App Router). **@anthropic-ai/sdk** (Managed Agents beta,
  `managed-agents-2026-04-01`, posé auto par le SDK). **zod 4**, **Vitest 4**.

## Layout (couches, prêt à grandir)

```
app/
  api/webhooks/whatsapp/route.ts        # entrée HTTP fine : (verif HMAC optionnelle) → parse → use-case → 200
  api/[transport]/route.ts              # endpoint MCP athlete-data statique (/api/mcp), bearer requis
  layout.tsx, page.tsx                  # minimal
src/
  config/config.ts                 # env zod (ANTHROPIC_API_KEY, DATABASE_URL, DB_ENCRYPTION_KEY, WHATSAPP_WEBHOOK_SECRET?, MCP_BEARER_TOKEN)
  auth.ts                          # verifyWebhookSignature (webhook) + verifyBearerToken (MCP), constant-time
  domain/athlete.ts                # modèle métier Athlete + enum AthleteStatus (indépendants de @inigo/db)
  repositories/
    athleteRepository.ts           # PORT AthleteRepository (findByPhone, setChatId)
    drizzleAthleteRepository.ts     # ADAPTER Drizzle (requête inline) + toAthlete(row→modèle)
  use-cases/
    routeInboundMessage.ts         # LE use-case : une seule fonction publique execute()
  mappers/
    whatsappPayload.ts             # schémas zod + normalisation du payload OpenWA + senderPhone
  brain/managedAgents.ts           # FRONTIÈRE cerveau : appendUserMessage(sessionId,text) + adaptateur SDK
  mcp/
    store/athleteDataStore.ts      # accès Neon scopé par athlete (createDb → forAthlete(id)) ; seul autre layer @inigo/db-aware
    tools/{index,result,profile,thresholds,goals,plan,adaptationLog}.ts  # tools MCP fins (reads + writes gated)
  deps.ts                          # singleton lazy { config, brain, db, repo, athleteData }
# futur : app/(admin)/… , app/api/admin/… , src/services/…
```

## Contrat de routing (le flux)

1. `route.ts` lit le **corps brut** ; si `WHATSAPP_WEBHOOK_SECRET` est set, vérifie
   `X-OpenWA-Signature` (HMAC sur le corps brut) ; sinon skip. Parse le JSON.
2. `routeInboundMessage.execute` : valide (zod), normalise l'enveloppe (wrappée
   `{event,data}` ou plate), **ignore** `fromMe` / groupes / non-message / messages sans texte.
3. Résout l'athlète via `senderPhone` (JID → E.164) puis `repo.findByPhone`. Les décisions
   métier sont **retournées** en `RouteOutcome` (union) : numéro inconnu (`unknown_number`),
   athlète sans session (`no_session`), sender illisible (`invalid_sender`) → route en 200.
   Seules les erreurs infra (Neon / Anthropic) throw → 502.
4. Sur un athlète résolu avec session : persiste `chat_id` si nouveau (`repo.setChatId`),
   formate l'enveloppe `inigo_athlete_id: <uuid>\nchat_id: <jid>\nmessage: <body>` et **append**
   à **sa** session via `brain.appendUserMessage` (dernier effet de bord → pas de doublon sur
   retry OpenWA). `inigo_athlete_id` = l'`athlete.id` interne (Neon), que l'agent repasse en
   argument `athleteId` aux tools du MCP athlete-data (`/api/mcp`) — **pas** l'id Intervals.icu.
   **Fire-and-forget** : on n'attend pas le run, l'agent répond via son MCP OpenWA
   (tools exécutés server-side via le vault).

## MCP athlete-data (le brain lit/écrit la donnée coaching)

Un serveur MCP hébergé **dans coach** (choix assumé : pas d'app séparée) donne au brain
(Managed Agent) un accès runtime à la donnée athlète structurée en Neon. Calqué sur
`intervals-icu-mcp` : `mcp-handler` + `withMcpAuth` + tools fins.

- **Endpoint statique** : `POST/GET /api/mcp` (`basePath: "/api"`, comme `intervals-icu-mcp`).
  **Pas d'URL dynamique par athlète** : un Managed Agent configure une seule URL de serveur MCP,
  fixe et partagée par toute la topologie d'agents et par tous les athlètes. L'athlète est donc
  **passé en argument de chaque tool** (`athleteId`), pas dans l'URL.
- **L'agent sait quel `athleteId` passer** parce que le routing l'injecte dans chaque message
  (`inigo_athlete_id: <uuid>`, cf. contrat de routing) — explicitement *l'id Inigo*, pas l'id
  Intervals.icu. Chaque handler de tool fait `store.forAthlete(args.athleteId)` (query scopée).
- **Auth** : bearer global `MCP_BEARER_TOKEN` (constant-time), `withMcpAuth({ required: true })`
  → 401 sans token. Le bearer prouve que l'appelant est le brain, **pas** quel athlète : avec
  l'id en argument, l'isolation repose sur le fait que l'agent passe le bon `athleteId`.
  Durcissement futur : un bearer par athlète qui rejette côté serveur tout `athleteId` ≠ celui du token.
- **Écritures toujours montées** : l'accès au endpoint est gardé par le bearer `MCP_BEARER_TOKEN`
  (401 sinon) et chaque write est **scopé par `athleteId`** (un update ne peut jamais toucher la
  donnée d'un autre athlète). Le flag `ENABLE_WRITE_TOOLS` a été retiré (les writes ne sont plus
  optionnels).
- **Côté agents brain, le toolset `inigo-coach-data` donne accès à TOUS les tools** (`configs: []` +
  `default_config.enabled: true`) — pas de liste par tool à maintenir à chaque évolution du MCP. La
  frontière de sécurité reste le bearer + le scoping par `athleteId` ; l'agent n'appelle de toute
  façon que les tools dont il a besoin (guidé par son prompt).

**Contrat des tools** (noms distincts d'`intervals-icu-mcp` pour garder la frontière lisible) :

| Tool | Type | Effet |
| -- | -- | -- |
| `get_profile` | read | identité *sûre* (display_name, tz, locale, status) + `athlete_profile`. **Aucun** secret/PII (pas de phone, LID, chat_id, session/agent/memory ids). |
| `get_thresholds` | read | dernier `athlete_threshold` par sport (FTP, HR, zones…). Filtre `sport?`. |
| `get_goals` | read | `goal` filtrés (`status?`, défaut active). |
| `get_training_plan` | read | plan courant + `plan_block` ordonnés (weekly targets). |
| `get_adaptation_log` | read | journal (`limit?` 20, `since?`), plus récent d'abord. |
| `update_profile` | write | upsert notes/prefs (`weightTargetKg`, `constraints`, `constraintsNotes`, `healthNotes`, `coachingTargets`). |
| `log_adaptation` | write | append au journal (`summary` requis). |
| `upsert_goal` | write | create/update d'un `goal` (update scopé par athleteId). |
| `save_training_plan` | write | create (sans `id`) / update (`id`) du `training_plan` **+** ses `plan_block` en une écriture atomique (`db.batch`). Blocs en **replace-all** (`order_index` recalculé) ; `status=active` archive les autres plans actifs ; update scopé par athleteId (jamais le plan d'un autre). Dates I/O en `YYYY-MM-DD`. |

**Frontière athlete-data ⟂ intervals-icu (à respecter dans les prompts d'agents) :**
- **athlete-data (Neon, ce MCP)** = *couche coaching* : profil structuré, seuils **historisés**,
  objectifs, macro-plan/blocs, contraintes, santé, cibles de coaching, journal d'adaptation.
- **intervals-icu** = *vérité quantifiée live* : activités, PMC du jour (CTL/ATL/TSB via
  `get_fitness`), courbes puissance/FC/allure, **calendrier des séances planifiées**, FTP/zones
  *calculées* par Intervals. Règle FTP : décision coaching = `athlete_threshold` (ce MCP) ;
  Intervals reste le calcul live.

## Conventions (en plus de la racine)

- **Frontière cerveau** : tout passe par `ManagedAgentBrain` (`src/brain/managedAgents.ts`).
  Un futur backend maison / maillage d'agents implémente cette interface — rien d'autre ne bouge.
- **Toute la logique métier vit dans des use-cases** (`src/use-cases/`) exposant une seule
  fonction publique `execute`. Les routes restent minces (HTTP only).
- **Accès données via un port `repository`** : le use-case ne dépend que de l'interface
  (`repositories/athleteRepository.ts`), jamais de l'ORM. Deux couches seulement connaissent
  `@inigo/db` : l'adapter Drizzle du routing (rows → **modèles métier** `domain/`), et le store
  MCP (`src/mcp/store/athleteDataStore.ts`, requêtes scopées par athlete pour les tools).
- **Multi-athlète** : le routing résout l'athlète + sa session par `phone_num` en base (Neon).
  Plus de session fixe en env ; pas de mapping en mémoire locale.
- Secrets : env serveur uniquement, validés au boot, jamais en log.

## Hypothèses à vérifier au bring-up (documentées, non devinées)

- **Enveloppe du webhook OpenWA** : `whatsappPayload.ts` est tolérant (accepte `{event,data}`
  ou message plat ; texte dans `body` ou `text`). Confronter à une vraie livraison
  (webhook.site) et resserrer si besoin.
- **Outil d'envoi MCP** = `MessageSendText` (confirmé via `tools/list`), exige `sessionId`
  (UUID de session OpenWA) + `chatId` + `text` → géré dans le **prompt système de l'agent**.

## Skills du Managed Agent

Les **skills attachées au Managed Agent Inigo** (au sens
[Managed Agents Skills](https://platform.claude.com/docs/en/managed-agents/skills)) vivent
désormais dans **`tooling/agent-skills/`** (ex. `intervals-icu-workouts`), à côté de l'outillage
qui les déploie. À ne pas confondre avec les skills de `/.claude/skills/` (consommées par Claude
Code en local). Cycle upload/attach : `@inigo/brain run brain:skill:deploy <nom> --apply` — voir
le skill Claude Code `managed-agents-api`.

## Tests

- Vitest co-localisés (`*.spec.ts`). `pnpm --filter @inigo/coach run test`.
- Couvre : config (dont `MCP_BEARER_TOKEN`), auth (HMAC + bearer),
  parsing/normalisation du payload + `senderPhone`, mapping `toAthlete`, **use-case
  `routeInboundMessage`** (4 cas de routing + filtres + throws infra, repo & brain fakes),
  brain (fake SDK). Côté MCP : intégration `InMemoryTransport` (reads + writes présents dont
  `save_training_plan`, un call renvoie du JSON, validation de date rejetée), route (401 sans
  bearer, 400 UUID invalide). Pas de réseau. Le store `saveTrainingPlan` (create, update
  replace-all, archivage de l'actif, scoping cross-athlète) est couvert par la spec d'intégration
  Neon (skip sans `DATABASE_URL`).
- Les specs d'intégration Neon (`*.integration.spec.ts` : adapter Drizzle **et** store MCP)
  tournent contre une vraie branche et se **skip** sans `DATABASE_URL`, donc `pnpm verify` reste offline.
- `pnpm verify` (racine) doit être vert avant tout commit.
