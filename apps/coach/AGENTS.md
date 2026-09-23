# coach — guide agents

Backend d'Inigo (Next.js full-stack, Vercel). Complète l'`AGENTS.md` racine. Contexte
humain / déploiement / setup : `README.md`.

## Rôle & principe

App **full-stack unique** : le **backend** (route handlers `app/api/*` + logique `src/`) et
l'**admin** (pages sous `app/(admin)/…`) vivent ensemble. Deux capacités : **router** un message
WhatsApp entrant vers la bonne session Managed Agent, résolue par le `phone_num` de l'athlète en
base (Neon) ; et **ouvrir une nouvelle session** pour un athlète depuis l'admin.

Séparation nette du système : le **cerveau** tourne chez Anthropic (Managed Agents),
**WhatsApp** chez OpenWA/Railway. Cette app ne fait qu'**orchestrer** (stateless) → Vercel
convient. On sortira un service dédié (worker Railway) uniquement le jour où *notre* code
aura besoin de compute persistant (queue, batch long) — pas avant.

## Stack

- **Next.js 16** (App Router). **@anthropic-ai/sdk** (Managed Agents beta,
  `managed-agents-2026-04-01`, posé auto par le SDK). **zod 4**, **Vitest 4**.
- **UI admin** : **Tailwind 4** (via `@tailwindcss/postcss`) + **shadcn/ui** (style `base-nova`,
  base-ui, lucide) — mêmes choix que `landing-page`, alias `@/*` → `src/*`.

## Layout (couches, prêt à grandir)

```
proxy.ts                                # HTTP Basic sur /admin + /api/admin/* (Next 16 ; runtime Node imposé)
app/
  api/webhooks/whatsapp/route.ts        # entrée HTTP fine : (verif HMAC optionnelle) → parse → use-case → 200
  api/coaching-data/[transport]/route.ts # endpoint MCP coaching-data statique (/api/coaching-data/mcp), bearer requis
  api/intervals/[transport]/route.ts    # endpoint MCP Intervals.icu statique (/api/intervals/mcp), bearer requis
  api/whatsapp/[transport]/route.ts     # endpoint MCP WhatsApp statique (/api/whatsapp/mcp), bearer requis
  api/admin/athletes/[athleteId]/session/route.ts  # POST : ouvre une session et repointe l'athlète
  (admin)/admin/page.tsx                # la page admin (server component) + _components/ (client)
  layout.tsx, page.tsx, globals.css     # minimal + Tailwind
src/
  config/config.ts                 # env zod (ANTHROPIC_API_KEY, DATABASE_URL, DB_ENCRYPTION_KEY, WHATSAPP_WEBHOOK_SECRET?, MCP_BEARER_TOKEN, INTERVALS_BASE_URL?) — PAS les vars d'admin
  auth.ts                          # verifyWebhookSignature + verifyBearerToken + verifyBasicAuth (constant-time) + adminCredentials (lit/valide ADMIN_*)
  admin/guard.ts                   # requireAdmin(request) : re-vérif de l'en-tête dans chaque route admin
  lib/utils.ts                     # cn() (clsx + tailwind-merge)
  components/ui/*                  # composants shadcn (button, card, table, badge, input, label)
  domain/
    athlete.ts                     # modèle métier Athlete + enum AthleteStatus (routing ; indépendants de @inigo/db)
    brain.ts                       # SessionElements / RunningSession / BrainInventory (indépendants du SDK)
    coaching.ts                    # modèles métier de la donnée coaching (contrat de sortie des tools MCP) + inputs
  repositories/
    athleteRepository.ts           # PORT AthleteRepository (findByPhone, findByLid, setChatId, findById, listAll, setSession, listSessions)
    drizzleAthleteRepository.ts     # ADAPTER Drizzle (requête inline) + toAthlete(row→modèle)
  use-cases/
    routeInboundMessage.ts         # use-case de routing : une seule fonction publique execute()
    startAthleteSession.ts         # use-case admin : clone la session courante, repointe l'athlète
    loadAdminOverview.ts           # use-case admin (lecture) : athlètes + sessions live + historique + inventaire
    sendAthleteMessage.ts          # use-case : la seule façon de parler à l'athlète (chat + session de passerelle)
    readActivityStreams.ts         # use-case : fenêtre obligatoire + refus au-delà du plafond, jamais de troncature
  repositories/whatsappGatewayRepository.ts  # PORT : la session de passerelle (en base, pas en env)
  mappers/
    whatsappPayload.ts             # schémas zod + normalisation du payload OpenWA + senderPhone
  brain/managedAgents.ts           # FRONTIÈRE cerveau : appendUserMessage + readSession + createSession + listInventory
  mcp/
    repository/athleteDataRepository.ts  # accès Neon scopé par athlete (createDb → forAthlete(id)), mappe rows→modèles (domain/coaching) ; seul autre layer @inigo/db-aware
    tools/{index,result,profile,thresholds,goals,plan,adaptationLog}.ts  # tools MCP fins (reads + writes gated)
  whatsapp/
    client/                        # client REST OpenWA typé (POST send-text ; zéro retry, un envoi n'est pas idempotent)
    credentials.ts                 # lit OPENWA_BASE_URL/API_KEY dans l'env — JAMAIS dans configSchema (cf. §Admin)
    resolveClient.ts               # createOpenWaResolver() : résout le client à l'appel, pas au boot
    mcp-tools/{index,result}.ts    # un seul tool : send_whatsapp_message(athleteId, text) — mapping pur, zéro décision
  intervals/
    client/                        # client REST Intervals.icu typé — transport seul, ajoute fields/limit, ne projette rien
    mappers/project.ts             # projection objet brut Intervals → modèle du coach (aucune décision)
    mcp-tools/{index,result,tools/*}.ts  # tools MCP Intervals fins ; chaque tool prend athleteId + résout un client par requête
    resolveClient.ts               # createIntervalsResolver(db, encKey, baseUrl) : getIntervalsKey → déchiffre → IntervalsIcuClient
  deps.ts                          # singleton lazy { config, brain, db, repo, athleteData, intervalsResolver }
# futur : src/services/…
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
   formate l'enveloppe `inigo_athlete_id: <uuid>\nmessage: <body>` et **append**
   à **sa** session via `brain.appendUserMessage` (dernier effet de bord → pas de doublon sur
   retry OpenWA). `inigo_athlete_id` = l'`athlete.id` interne (Neon), que l'agent repasse en
   argument `athleteId` aux tools du MCP athlete-data (`/api/coaching-data/mcp`) — **pas** l'id Intervals.icu.
   **Fire-and-forget** : on n'attend pas le run ; l'agent répond lui-même via le MCP WhatsApp
   de cette app (`send_whatsapp_message`). Le `chat_id` n'est **pas** dans l'enveloppe : il est
   persisté (`repo.setChatId`) et résolu côté serveur au moment de l'envoi.

## MCP coaching-data (le brain lit/écrit la donnée coaching)

Un serveur MCP hébergé **dans coach** (choix assumé : pas d'app séparée) donne au brain
(Managed Agent) un accès runtime à la donnée athlète structurée en Neon. Calqué sur
`intervals-icu-mcp` : `mcp-handler` + `withMcpAuth` + tools fins.

- **Endpoint statique** : `POST/GET /api/coaching-data/mcp` (`basePath: "/api/coaching-data"`). Les trois
  serveurs MCP ont la même forme `app/api/<domaine>/[transport]/route.ts` + `basePath: "/api/<domaine>"`.
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

## MCP Intervals.icu (le brain lit/écrit Intervals via coach) — INI-7

Un **second** serveur MCP hébergé dans coach (`POST/GET /api/intervals/mcp`, `basePath:
"/api/intervals"`), **distinct** de l'athlete-data (`/api/coaching-data/mcp`). Rapatrié depuis l'ex-app
standalone `intervals-icu-mcp` pour passer en **multi-athlète** : la clé Intervals.icu n'est
plus une seule clé en env, mais **une par athlète** stockée chiffrée dans Neon
(`athlete_credential`, cf. `@inigo/db`).

- **Clé par athlète, résolue au moment de l'usage** : chaque tool prend un `athleteId` (le même
  `inigo_athlete_id` que coach-data — l'id Inigo, **pas** l'id Intervals). Le handler résout un
  client **par requête** via `createIntervalsResolver` : `getIntervalsKey(db, athleteId, DB_ENCRYPTION_KEY)`
  → déchiffre la clé + lit l'id Intervals externe → `new IntervalsIcuClient(...)`. Le secret est
  déchiffré **dans coach**, jamais renvoyé au brain ni au LLM.
- **Absence de clé** : le resolver `throw` (message clair, sans secret) → `errorResult` du tool.
- **Deux endpoints, pas un** : choix assumé pour garder le **nom de serveur brain `intervals-icu`**
  et les **allowlists de toolset par agent** (coordinateur = read-only, constructeur/réadaptateur =
  full) inchangées. Seule l'URL du serveur `intervals-icu` bascule (ops, post-deploy) vers
  `https://app.inigo-coach.com/api/intervals/mcp`.
- **Auth** : même bearer global `MCP_BEARER_TOKEN` que coach-data (`withMcpAuth({ required: true })`).
- **Écriture d'une clé** : `setIntervalsKey` (`@inigo/db`) — écriture chiffrée + rotation
  (`rotatedAt`). La **capture par onboarding WhatsApp est hors périmètre** (ticket dédié).

## MCP WhatsApp (le brain répond à l'athlète) — INI-37

Le **troisième** serveur MCP (`POST/GET /api/whatsapp/mcp`, `basePath: "/api/whatsapp"`), qui
remplace l'accès direct de l'agent au serveur MCP de la passerelle OpenWA.

- **La décision vit dans un use-case**, `sendAthleteMessage` : c'est lui qui assemble ce qu'un
  envoi demande (quel athlète, quel chat, quelle session de passerelle) et qui rend un
  `SendMessageOutcome`. Le tool MCP ne fait que traduire cet outcome en résultat MCP, comme une
  route le traduirait en HTTP. Les échecs métier sont **retournés**, la panne de passerelle
  **throw** : ce n'est pas une décision, c'est une rupture, et le message du client dit déjà si
  une nouvelle tentative est sûre.
- **Un seul tool** : `send_whatsapp_message(athleteId, text)`. Le serveur OpenWA en publie 51
  pour celui-là seul, soit ≈ 8 600 tokens de définitions rechargés à chaque requête modèle du
  coordinateur. Et il exigeait de l'agent le `sessionId` de la passerelle, un identifiant
  d'infra qu'il n'avait aucun moyen de résoudre : les credentials de vault
  `environment_variable` sont substitués à la **sortie du sandbox**, alors que les appels MCP
  partent des serveurs d'Anthropic. D'où INI-24, et un coach muet.
- **Rien d'infra dans le contexte du modèle** : le `chatId` vient de Neon (`athlete.chat_id`,
  appris par le routing), le `sessionId` de l'env du serveur. L'agent nomme un athlète.
- **Pourquoi MCP et pas un custom tool** : un custom tool Managed Agents est exécuté côté
  client, la session passe en `requires_action` et attend un `user.custom_tool_result` sur le
  flux d'événements. Coach est fire-and-forget sur Vercel et n'écoute pas ce flux ; il faudrait
  un worker persistant. Un serveur MCP est appelé en serveur à serveur, donc rien ne change.
- **Credentials hors `configSchema`** (`src/whatsapp/credentials.ts`, même règle que l'admin) :
  `OPENWA_BASE_URL` et `OPENWA_API_KEY`. Une absence dégrade ce seul endpoint. `deps.whatsapp`
  est un **resolver**, pas un client : le construire au boot ferait échouer `getDeps()` pour le
  webhook et les deux autres MCP.
- **La session de la passerelle vit en base, pas en env** (table `whatsapp_gateway`, une seule
  ligne, `WhatsappGatewayRepository`). Elle change à chaque ré-appairage WhatsApp (session
  tombée, QR rescanné) : en variable d'environnement, rendre sa voix au coach demanderait un
  redeploy. Un formulaire dans `/admin` l'écrit, `POST /api/admin/whatsapp-session`.
- **Transport vers OpenWA : REST**, `POST /api/sessions/<session>/messages/send-text` avec
  `X-API-Key` et `{chatId, text}`. La route accepte le nom de session comme son id, ce qui fait
  disparaître le piège nom-contre-UUID du tool MCP d'OpenWA.
- **Zéro retry sur l'envoi** (`src/whatsapp/client/client.ts`) : un envoi n'est pas idempotent,
  une seconde tentative après timeout est un doublon chez l'athlète. Et comme l'agent lit le
  message d'erreur, le cas timeout dit explicitement de ne pas réessayer.
- **Un 2xx ne veut pas dire envoyé** : la passerelle remonte ses échecs métier dans le corps
  (`success: false`). Le client en fait une vraie erreur.
- **Ni la session ni la clé n'apparaissent dans un message d'erreur** : ces messages remontent
  au modèle en résultat de tool, donc le client les redacte avant de composer l'erreur.

## Volume renvoyé aux agents — INI-39

Tout ce qui entre dans le contexte d'un thread est payé **une fois à l'écriture du cache puis
~5 fois à la relecture** (ratio mesuré sur une vraie session : 2,47 M de tokens écrits pour
12,58 M relus). Un résultat d'outil de N tokens coûte donc `N × 3,50 $ / 1M` aux tarifs
`claude-sonnet-5`, pas N tokens payés une fois. D'où les règles suivantes.

- **`domain/training.ts` est le contrat de sortie côté Intervals**, symétrique de
  `domain/coaching.ts` pour la donnée Neon. Avant, les tools Intervals renvoyaient l'objet brut
  de l'API : c'est cette asymétrie qui laissait remonter 174 champs par activité.
- **Les listes de champs y sont l'unique source de vérité.** La même constante alimente le
  paramètre `fields` envoyé à Intervals et la projection appliquée en sortie. Demander un champ
  qu'on jette ensuite n'est pas exprimable. Les classifications complètes (174 champs d'Activity,
  46 de Wellness, 60 d'Event) sont sur INI-39, **vérifiées par script** : gardés + jetés = total,
  aucun non classé.
- **`fields` n'existe que sur deux endpoints de l'API** (activities et wellness), et il exclut
  aussi les nulls. Partout ailleurs la projection se fait chez nous.
- **Jamais de rééchantillonnage des streams.** Le constructeur programme du 30/15 Rønnestad
  (30 s à 106-115 % FTP, 15 s à ~50 %) et l'analyste vérifie l'exécution : toute moyenne de
  bucket plus grossière que quelques secondes efface ce qu'il y avait à vérifier. C'est donc
  l'appelant qui cible une fenêtre, à résolution pleine, et un appel au-delà de
  `MAX_STREAM_VALUES` est **refusé** avec de quoi le resserrer. Une troncature silencieuse ferait
  raisonner l'agent sur un effort partiel sans qu'il le sache.
- **Les courbes ne renvoient plus `activities`**, qui était une map d'objets Activity complets
  sans aucun paramètre d'API pour l'exclure.
- **Liste contre détail** : `get_events` ne porte pas `workout_doc`, `get_event` le porte. Une
  semaine fait cinq à sept séances.
- **Résultats minifiés** (`JSON.stringify(data)`), sur les trois serveurs.
- **`athleteId` est déclaré `z.string()`** : `z.uuid()` émettait un regex de 166 caractères dans
  le schéma de chacun des 26 outils. La validation est faite côté serveur, dans les wrappers
  `runAthleteTool`, pour qu'elle ne puisse pas être oubliée sur un outil neuf.

Règle de partage quand tu ajoutes un tool : **choix produit → use-case**, **transformation sans
décision → mapper**, **forme à nommer → interface de domaine**. Jamais une liste de champs métier
ni un plafond en dur dans un adaptateur MCP.

## Admin (`/admin`) — ouvrir une session

Deuxième capacité de l'app. Un bouton par athlète crée une session Managed Agent sur l'agent
coordinateur et en fait la session active de l'athlète dans `athlete_session`.

- **Historique des sessions** (`athlete_session`, INI-38) : chaque session ouverte y reste.
  La session active est la ligne sans `ended_at` ; un index unique partiel interdit d'en
  avoir deux par athlète. `setSession` clôt l'active et insère la nouvelle dans un seul
  `db.batch` (une transaction Postgres, le driver HTTP Neon n'a pas de transaction
  interactive). Les lectures d'athlète joignent la session active dans la même requête (via l'index
  partiel, jamais tout l'historique) : le modèle `Athlete` porte `activeSession`
  (`{ sessionId, agentId }` ou null), c'est ce que le routing lit. L'historique complet
  n'est lu que par `listSessions`, pour l'admin. L'admin
  liste les sessions remplacées, toujours lisibles chez Anthropic.

- **Pourquoi une nouvelle session** : référencer l'agent **par id** épingle sa *dernière*
  version à la création, et une session **fige** cette config pour sa vie entière (seuls
  `tools`/`mcp_servers` changent après). Une nouvelle version d'agent n'a donc d'effet runtime
  qu'en (re)créant une session. Même raison que l'étape 3 de `brain:deploy`.
- **Rien n'est stocké de la config de session** (seulement ses ids et ses dates). `readSession` lit la session courante de
  l'athlète (`agent.id`, `environment_id`, `vault_ids`, `resources`) et `createSession` la
  recrée. La session qui tourne **est** la source de vérité : une copie en base ou en env peut
  diverger du plan de contrôle, elle non. Ne réintroduis pas de table de config ici.
- **Mapping lecture → création obligatoire.** Les `resources` renvoyées portent des champs
  output-only (`id`, `created_at`, `updated_at`, `mount_path`, `name`, `description`) que la
  création refuse : `toSessionResource` ne garde que ce qui est réinjectable. Un
  `github_repository` **ne peut pas** être cloné (son `authorization_token` n'est jamais
  renvoyé) : on throw plutôt que d'ouvrir une session amputée. Vérifié contre l'API réelle.
- **Seule la première session demande un choix**, fait dans des listes alimentées par
  `listInventory` (live). L'agent proposé par défaut est celui qui porte un roster
  `multiagent`. Les vaults s'appellent `display_name` là où tout le reste utilise `name`.
- **Lectures résilientes** : `loadAdminOverview` capture les erreurs **par athlète**
  (`sessionError`) au lieu d'avorter — un pointeur vers une session supprimée est justement
  la dérive que cette page doit rendre visible. Même règle que les lectures de `@inigo/brain`.
- **Ordre des effets** : la session est créée **avant** l'écriture du pointeur, donc un échec
  Anthropic laisse l'athlète sur sa session précédente plutôt que orphelin. `setSession` écrit
  aussi `managed_agent_id`, pour que l'historique dise toujours quel agent tournait vraiment.
- **Ce qui reste dans `tooling/brain`** : appliquer les configs d'agents depuis le snapshot et
  re-pinner le roster (Vercel n'a pas le snapshot git). L'admin ouvre la session, rien de plus.
- **Auth** : HTTP Basic (`ADMIN_USER`/`ADMIN_PASSWORD`) posée par `proxy.ts`, matcher limité à
  `/admin` et `/api/admin/*` — le webhook et les MCP ne doivent **jamais** voir de challenge
  Basic. Chaque route admin re-vérifie l'en-tête via `requireAdmin`, pour ne pas faire reposer
  l'autorisation sur le seul proxy.
- **L'ADMIN NE DOIT JAMAIS POUVOIR CASSER LE COACH.** Ses identifiants ne sont **pas** dans le
  schéma de `config.ts` : ce schéma est parsé sur *chaque* chemin de requête, donc n'importe
  quelle règle sur l'admin (absent, ou juste trop court) fait tomber le webhook WhatsApp et les
  deux MCP avec elle. C'est arrivé : `ADMIN_PASSWORD` trop court → webhook 500 et MCP 401 malgré
  un bearer valide. Ils sont lus et validés là où ils servent (`adminCredentials()`), qui échoue
  fermé → 503 côté admin, rien ailleurs. **N'ajoute jamais de variable propre à l'admin dans
  `configSchema`.** Gardé par les specs des routes webhook et MCP, qui tournent avec un
  `ADMIN_PASSWORD` volontairement inutilisable.

## Conventions (en plus de la racine)

- **Frontière cerveau** : tout passe par `ManagedAgentBrain` (`src/brain/managedAgents.ts`).
  Un futur backend maison / maillage d'agents implémente cette interface — rien d'autre ne bouge.
- **Toute la logique métier vit dans des use-cases** (`src/use-cases/`) exposant une seule
  fonction publique `execute`. Les routes restent minces (HTTP only).
- **Accès données via un port `repository`** : le use-case ne dépend que de l'interface
  (`repositories/athleteRepository.ts`), jamais de l'ORM. Deux couches seulement connaissent
  `@inigo/db` : l'adapter Drizzle du routing (rows → **modèles métier** `domain/`), et le
  repository MCP (`src/mcp/repository/athleteDataRepository.ts`) qui mappe rows→modèles (`domain/coaching.ts`).
- **Multi-athlète** : le routing résout l'athlète + sa session par `phone_num` en base (Neon).
  Plus de session fixe en env ; pas de mapping en mémoire locale.
- Secrets : env serveur uniquement, validés au boot, jamais en log.

## Hypothèses à vérifier au bring-up (documentées, non devinées)

- **Enveloppe du webhook OpenWA** : `whatsappPayload.ts` est tolérant (accepte `{event,data}`
  ou message plat ; texte dans `body` ou `text`). Confronter à une vraie livraison
  (webhook.site) et resserrer si besoin.
- **`MCP_READONLY=false` reste obligatoire sur la passerelle OpenWA** : sans ça `MessageSendText`
  n'est pas monté (25 outils de lecture au lieu de 51) et c'est désormais **coach** qui se prend
  l'erreur, plus l'agent. Comparaison stricte, non validée au boot → revérifier après chaque
  redeploy. Détails → `docs/railway-cookbook.md` §5.

## Skills du Managed Agent

Les **skills attachées au Managed Agent Inigo** (au sens
[Managed Agents Skills](https://platform.claude.com/docs/en/managed-agents/skills)) vivent
désormais dans **`tooling/agent-skills/`** (ex. `intervals-icu-workouts`), à côté de l'outillage
qui les déploie. À ne pas confondre avec les skills de `/.claude/skills/` (consommées par Claude
Code en local). Cycle upload/attach : `@inigo/brain run brain:skill:deploy <nom> --apply` — voir
le skill Claude Code `managed-agents-api`.

## Tests

- Vitest co-localisés (`*.spec.ts`). `pnpm --filter @inigo/coach run test`.
- Couvre : config (dont `MCP_BEARER_TOKEN` ; et le fait qu'elle **ignore** les vars d'admin),
  auth (HMAC + bearer + Basic : en-tête absent/malformé, mauvais user, mauvais mot de passe,
  deux-points dans le mot de passe ; `adminCredentials` qui échoue fermé sur absent/trop court),
  **routes webhook et MCP bootées avec un admin inutilisable** (la régression de prod),
  parsing/normalisation du payload + `senderPhone`, mapping `toAthlete` / `toAthleteSession`
  (intégration Neon, skippée sans `DATABASE_URL` : bascule de session qui garde l'ancienne,
  deuxième session active refusée par la DB), **use-case
  `routeInboundMessage`** (4 cas de routing + filtres + throws infra, repo & brain fakes),
  brain (fake SDK : append, readSession qui retire les champs output-only, createSession,
  listInventory), **`startAthleteSession`** (clone nominal, éléments ignorés quand il y a une
  session, ressources reportées telles quelles, première session depuis des éléments choisis,
  préfixes d'ids refusés, athlète inconnu, échec de lecture ou de création qui n'écrit rien) et
  **`loadAdminOverview`** (session cassée isolée sur sa ligne, inventaire injoignable qui
  dégrade au lieu de casser, historique sans la session active). Route admin : 401 sans/avec mauvais identifiants, 400 UUID
  invalide, 200 clone, 200 première session, 409 sans rien à cloner, 404, 502. Côté MCP :
  intégration `InMemoryTransport` (reads + writes présents dont
  `save_training_plan`, un call renvoie du JSON, validation de date rejetée), route (401 sans
  bearer, 400 UUID invalide). Les trois routes MCP ont un cas **200** qui garde le `basePath` :
  un `basePath` désaligné répond 404 alors que le cas 401 continue de passer.
  Côté WhatsApp : `send_whatsapp_message` est le seul tool exposé et ne prend que
  `athleteId` + `text` (garde : le `sessionId` ne doit jamais redevenir une entrée), athlète
  inconnu et athlète sans `chat_id` donnent une erreur propre sans rien envoyer, passerelle non
  configurée devient une erreur de tool ; le client couvre le succès, la trame SSE, le
  `success:false` sous un HTTP 200, le non-2xx, **l'absence de retry** et le fait que la clé
  d'API n'apparaît pas dans l'erreur. Pas de réseau. Le store `saveTrainingPlan` (create, update
  replace-all, archivage de l'actif, scoping cross-athlète) est couvert par la spec d'intégration
  Neon (skip sans `DATABASE_URL`).
- Les specs d'intégration Neon (`*.integration.spec.ts` : adapter Drizzle **et** store MCP)
  tournent contre une vraie branche et se **skip** sans `DATABASE_URL`, donc `pnpm verify` reste offline.
- `pnpm verify` (racine) doit être vert avant tout commit.
