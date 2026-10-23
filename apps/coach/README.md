# coach

Backend d'Inigo (Next.js, full-stack, sur Vercel). Aujourd'hui il expose **un webhook**
qui **route** les messages WhatsApp entrants (depuis une gateway **OpenWA** auto-hébergée)
vers la **bonne session de Managed Agent Anthropic**, résolue par le **`phone_num`** ou le **LID WhatsApp** de
l'athlète en base (Neon). L'agent répond ensuite **lui-même** sur WhatsApp, via le serveur
MCP WhatsApp de cette app.

Il expose **trois serveurs MCP** pour le brain, tous de la forme `api/<domaine>/mcp` :
**`coaching-data`** (`/api/coaching-data/mcp`) pour la donnée coaching structurée en base
(profil, seuils, objectifs, plan, journal d'adaptation) ; **Intervals.icu**
(`/api/intervals/mcp`) pour la donnée d'entraînement live, avec le token OAuth résolu par athlète
depuis Neon (rapatrié de l'ex-app `intervals-icu-mcp`, INI-7) ; et **WhatsApp**
(`/api/whatsapp/mcp`), un unique outil `send_whatsapp_message` qui relaie vers la passerelle
OpenWA (INI-37).

À terme, cette même app hébergera l'**admin** (dashboards, actions, triggers sur le brain).

> WhatsApp non-officiel, par choix : on garde toute la flexibilité de WhatsApp classique.
> L'API Cloud officielle de Meta n'est volontairement pas utilisée.

## Flux (multi-athlète, routing par `phone_num` ou LID)

```
WhatsApp (athlète)
   ⇅
OpenWA (Railway) — webhook message.received ──►  coach
                 ◄── REST send-text ── coach  ◄── MCP send_whatsapp_message ── Managed Agent
   ⇅
coach (Vercel)
   POST /api/webhooks/whatsapp → routeInboundMessage.execute
     → résout l'athlète + sa session via phone_num ou LID (Neon) → append user.message à SA session
   ⇅
Managed Agent (Anthropic) — session de l'athlète = mémoire ; MCP: coach (coaching-data + Intervals + WhatsApp) ; répond via send_whatsapp_message
```

Le use-case dérive le numéro de l'expéditeur depuis le JID WhatsApp, résout l'athlète en base,
formate l'enveloppe du tour (voir `AGENTS.md`, « Enveloppe d'un tour »), et **append** à **sa** session. Un numéro inconnu, un athlète
sans session ou un sender illisible sont gérés explicitement (aucun forward, réponse 200). Un numéro
inconnu qui envoie le code d'accès devient un athlète en onboarding avec sa propre session ; sans le
code, il reçoit une réponse fixe (INI-45, réglages dans la Card « Onboarding » de `/admin`). Quand
son onboarding est complet, son message suivant le fait passer au coordinateur (INI-49) : statut
`active`, nouvelle session, et une ligne `passation:` qui déclenche le plan et la semaine 1.
**Identification.** Un athlète est reconnu par son adresse WhatsApp : son numéro (`phone_num`) ou son
LID (`whatsapp_lid`), deux alias du même compte, appris automatiquement au fil des messages.
`chat_id` n'est que l'adresse de réponse. Côté exploitation :
- `WHATSAPP_WEBHOOK_SECRET` (obligatoire, dans chaque environnement Vercel) doit être identique au
  secret de signature de **chaque** webhook OpenWA qui pointe vers coach : c'est lui qui garantit que
  le webhook vient bien d'OpenWA ;
- garder `RESOLVE_LID_TO_PHONE=true` sur le service OpenWA : c'est lui qui relie un LID au numéro ;
- un log `sender conflicts with athlete records` signale des alias contradictoires (deux fiches pour
  la même personne, ou un numéro recyclé par quelqu'un d'autre) : corriger les fiches à la main.

Détails : `AGENTS.md`, section « Identification d'un athlète (WhatsApp) ».

L'agent tourne côté Anthropic (les tools MCP s'exécutent server-side via le vault), donc **rien
ici n'a besoin d'écouter la réponse** ni d'envoyer le message.

## Variables d'environnement

Validées au boot par `src/config/config.ts`. Copie `.env.example` → `.env` **dans ce dossier**.

> **Toutes** ces variables doivent vivre dans `apps/coach/.env` : Next ne lit que le `.env`
> de l'app qu'il fait tourner. `packages/db/.env` est un autre fichier, utilisé uniquement
> par drizzle-kit pour les commandes de migration — le coach ne le lit jamais. Même chose en
> prod : le projet Vercel `coach` porte ses propres variables. Une variable rangée dans le
> mauvais `.env` est simplement absente ici (l'erreur de boot le rappelle).

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic (server-side) |
| `DATABASE_URL` | Connexion Neon (base coaching partagée via `@inigo/db`), server-side |
| `DB_ENCRYPTION_KEY` | Clé base64 32 octets (AES-256-GCM) pour sceller les secrets par athlète |
| `WHATSAPP_WEBHOOK_SECRET` | Obligatoire (min 16 car.) : clé HMAC de `X-OpenWA-Signature`, identique au secret des webhooks OpenWA. Sans elle, toutes les requêtes (webhook, les trois MCP, cron, admin) échouent en 500 |
| `MCP_BEARER_TOKEN` | Bearer que le brain présente aux trois MCP (min 16 car., server-side) |
| `INTERVALS_BASE_URL` | Optionnel : override de l'URL de l'API Intervals.icu (défaut `https://intervals.icu/api/v1`) |
| `OPENWA_BASE_URL` | URL de la passerelle OpenWA vers laquelle le coach relaie les réponses |
| `OPENWA_API_KEY` | Clé API OpenWA (rôle OPERATOR), server-side |
| `BETTER_AUTH_SECRET` | Signe les cookies de session (Better Auth), min 32 car., un par environnement |
| `BETTER_AUTH_URL` | Origine publique de l'app (`https://app.inigo-coach.com`) : magic links et redirect URI Google |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Client OAuth Google (Web) de la connexion des coachs, redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google` |
| `SLACK_ALERT_WEBHOOK_URL` | Optionnel : Incoming Webhook Slack des alertes de session WhatsApp (absente → log seul) |
| `CRON_SECRET` | Secret du cron watchdog (`/api/cron/whatsapp-watchdog`) ; Vercel l'envoie en Bearer. Absente → le watchdog refuse de tourner |

Les variables de connexion (Better Auth, Google) ne sont **pas** dans le schéma zod de
`config.ts` : ce schéma est validé à chaque requête, donc une valeur absente **ou trop courte**
ferait tomber le webhook WhatsApp et les MCP avec elle. Elles sont lues et validées là où elles
servent (`authEnv()`) : incomplètes, l'admin refuse de servir (503) et les liens athlètes sont
indisponibles, rien d'autre ne bouge.

## Setup (résumé)

1. **Gateway OpenWA sur Railway** — voir [`docs/railway-cookbook.md`](docs/railway-cookbook.md).
2. **Session Managed par athlète** : ouverte depuis l'**admin** (`/admin`, bouton
   « Nouvelle session »), qui la crée et en fait la session active de l'athlète dans `athlete_session`
   (les précédentes restent dans l'historique) : c'est ce que le routing résout. Rien n'est stocké de la config de session : l'admin lit la
   session que l'athlète fait déjà tourner et la recrée à l'identique. Un nouvel
   athlète arrivé avec le code d'accès a, lui, sa session d'onboarding ouverte automatiquement.
   > Les *deployments* Managed servent uniquement aux runs planifiés (cron) ; ici on n'en utilise pas : le coach pousse les messages à une session existante via l'API (`POST /v1/sessions/:id/events`).
3. **Prompt système de l'agent** : « tu reçois des messages WhatsApp au format
   `date_time: …\ninigo_athlete_id: …\nathlete_display_name: …\nlocale: …\nmessage: "…"`. `inigo_athlete_id` est l'id athlète Inigo
   (à utiliser pour les trois MCP ; ce n'est pas l'id Intervals.icu). Réponds en appelant
   `send_whatsapp_message(athleteId=<l'inigo_athlete_id>, text=…)` ; concis, adapté à
   WhatsApp ». Ni chat ni session de passerelle à fournir : le backend les résout.
4. **Webhook OpenWA** → URL `https://<coach>/api/webhooks/whatsapp`, event
   `message.received`.

## Admin (`/admin`)

Page d'admin servie par cette même app. Aujourd'hui une capacité : **ouvrir une nouvelle
session brain pour un athlète** et pointer sa ligne dessus.

Pourquoi ça compte : une session **fige la config de l'agent à sa création** (seuls
`tools`/`mcp_servers` bougent ensuite). Après un `brain:deploy` qui bump une version d'agent,
c'est la création d'une session fraîche qui fait basculer le runtime sur cette version. Ce
bouton remplace la manœuvre d'avant (commande locale, puis `UPDATE` SQL à la main).

- **Aucune config stockée.** Le bouton lit la session courante de l'athlète
  (`GET /v1/sessions/{id}`, qui renvoie `agent.id`, `environment_id`, `vault_ids` et
  `resources`) et la recrée à l'identique, en repointant l'agent sur sa dernière version.
  La session qui tourne **est** la source de vérité : contrairement à une copie en base ou en
  env, elle ne peut pas diverger du plan de contrôle. Seule la **première** session d'un
  athlète demande un choix, fait dans des listes déroulantes alimentées en direct
  (agents, environments, vaults, memory stores) — donc pas d'id tapé à la main.
- **Ce que la page affiche est lu en direct** chez Anthropic : l'agent et sa version,
  l'environment, les vaults, la mémoire. Une session devenue illisible (supprimée côté
  console) s'affiche en erreur sur sa ligne, sans casser le reste de la page.
- **Une limite assumée** : une session montant un `github_repository` ne peut pas être clonée,
  parce que la création exige un `authorization_token` que l'API ne renvoie jamais. Le cas est
  refusé bruyamment plutôt que d'ouvrir une session amputée de son credential.
- **Auth** (INI-85) : connexion Google des coachs, **sur invitation** (`/admin/coaches`), via
  Better Auth. `proxy.ts` renvoie vers `/login` (ou 401 sur `/api/admin/*`) sans cookie de
  session ; le layout admin et chaque route admin relisent la session et n'acceptent qu'un
  coach (une session d'athlète reçoit 403). Le webhook OpenWA et les MCP gardent leurs propres
  credentials. Premier coach : `sohet.thomas@gmail.com`, invité par la migration.
- **L'admin ne peut pas casser le coach** : ses variables ne sont pas dans le schéma d'env
  partagé. Mal réglées, l'admin répond 503 et le log dit quoi corriger ; le webhook et les MCP
  continuent de tourner.
- **Ce que l'admin ne fait pas** : appliquer les configs d'agents depuis le snapshot et
  re-pinner le roster du coordinateur. Ça reste `@inigo/brain` en local (`brain:deploy`),
  qui a besoin du snapshot git. L'admin ouvre la session, c'est tout.
- **L'ancienne session n'est pas supprimée** : elle reste lisible dans la console Anthropic,
  simplement plus rien n'y est routé. Le bouton demande donc confirmation quand l'athlète a
  déjà une session.

## MCP coaching-data (accès du brain à la donnée coaching)

Endpoint **statique** : `GET/POST /api/coaching-data/mcp` (un Managed Agent configure une seule URL de serveur
MCP, fixe et partagée). L'athlète n'est donc **pas** dans l'URL : chaque tool prend un argument
`athleteId` (l'UUID Inigo, = `inigo_athlete_id` du message), et la requête est scopée à cet
athlète (`store.forAthlete(athleteId)`). Auth par **bearer** `MCP_BEARER_TOKEN` (401 sinon).
Lectures et écritures sont toutes montées ; chaque écriture est scopée par `athleteId` (un update
ne touche jamais la donnée d'un autre athlète) et l'accès reste gardé par le bearer.

Tools : lecture `get_profile`, `get_thresholds`, `get_goals`, `get_training_plan`,
`get_adaptation_log` ; écriture `update_profile`, `log_adaptation`, `upsert_goal`,
`save_training_plan` (crée/met à jour le macro-plan + ses blocs, en une écriture atomique).
`get_profile` n'expose **aucun** secret ni donnée de routing (ni `phone_num`, ni ids de session).

**Frontière athlete-data ⟂ Intervals.icu** (deux endpoints de coach) : `athlete-data` porte la
*couche coaching* (profil, seuils historisés, objectifs, plan, journal). Le MCP Intervals.icu
(`/api/intervals/mcp`) porte la *vérité live* (activités, CTL/ATL/TSB, courbes, calendrier
planifié). La FTP de décision vient d'ici (`get_thresholds`) ; Intervals reste le calcul live.

**Côté Managed Agent** : ajouter à la session un vault `static_bearer`
(`url=https://<coach>/api/coaching-data/mcp`, `token=MCP_BEARER_TOKEN`) et déclarer le serveur dans les
`mcp_servers` de l'agent. Le bearer prouve que l'appelant est le brain, pas quel athlète :
l'isolation repose sur l'`athleteId` passé par l'agent (durcissement futur : bearer par athlète).

## Lancer en local

```bash
pnpm dev:coach     # next dev (depuis la racine)

# Admin : http://localhost:3000/admin → /login, connexion Google (client OAuth local, compte invité).

# Tester le webhook (livraison signée comme le fait OpenWA, avec le secret de apps/coach/.env) :
BODY='{"chatId":"628@c.us","body":"salut coach","type":"text"}'
SIG="sha256=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_WEBHOOK_SECRET" -hex | sed 's/^.* //')"
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "content-type: application/json" -H "x-openwa-signature: $SIG" -d "$BODY"
# -> {"ok":true} ; le message est append à la session (voir logs). Sans signature : 401.

# Lister les tools du MCP coaching-data :
curl -X POST "http://localhost:3000/api/coaching-data/mcp" \
  -H "authorization: Bearer $MCP_BEARER_TOKEN" \
  -H "accept: application/json, text/event-stream" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Lire le profil d'un athlète (athleteId = UUID Inigo en base) :
curl -X POST "http://localhost:3000/api/coaching-data/mcp" \
  -H "authorization: Bearer $MCP_BEARER_TOKEN" \
  -H "accept: application/json, text/event-stream" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_profile","arguments":{"athleteId":"'$ATHLETE_ID'"}}}'
```

## Déploiement

Vercel (Next.js). Variables via le dashboard Vercel (dont `MCP_BEARER_TOKEN`, requis, à poser
**avant** deploy). Endpoints : `/api/webhooks/whatsapp`, `/api/coaching-data/mcp`, `/api/intervals/mcp`,
`/api/whatsapp/mcp` et `/admin`.

Poser aussi `OPENWA_BASE_URL` et `OPENWA_API_KEY`, sans quoi le coach ne peut pas répondre.
Elles sont hors du schéma zod partagé, donc leur absence ne casse que `/api/whatsapp/mcp` :
le déploiement passe et rien ne le signale au boot. La **session** de la passerelle, elle,
n'est pas une variable d'env : elle vit en base et se règle depuis `/admin`, parce qu'elle
change à chaque ré-appairage WhatsApp.

Surveillance de la session WhatsApp (INI-40) : poser `CRON_SECRET` et `SLACK_ALERT_WEBHOOK_URL`,
puis, côté OpenWA, abonner le webhook du coach à `session.status`, `session.disconnected`,
`session.reconnect_loop` et `session.restriction` (en plus de `message.received`). Le cron quotidien est déclaré dans
`vercel.json` ; pour le tester à la main : `vercel crons run /api/cron/whatsapp-watchdog`.

Pour utiliser l'admin et les liens athlètes, poser `BETTER_AUTH_SECRET` (min 32 car.),
`BETTER_AUTH_URL=http://localhost:3000` et le client OAuth Google **local** (`GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, redirect URI `http://localhost:3000/api/auth/callback/google`), puis
appliquer les migrations (tables `auth_*` et `coach_invitation`). Absentes ou trop courtes, seuls
l'admin et les liens sont indisponibles (503, avec un log qui dit quoi corriger) : le webhook et
les MCP continuent de tourner. Pas de connexion Google sur les previews Vercel (Google n'accepte
pas d'URL joker).

## Contribuer

Architecture interne, conventions, structure en couches, contrat de routing et tests :
voir [`AGENTS.md`](AGENTS.md).
