# coach — guide agents

Backend d'Inigo (Next.js full-stack, Vercel). Complète l'`AGENTS.md` racine. Contexte
humain / déploiement / setup : `README.md`.

## Rôle & principe

App **full-stack unique** : le **backend** (route handlers `app/api/*` + logique `src/`) et
l'**admin** (pages sous `app/(admin)/…`) vivent ensemble. Deux capacités : **router** un message
WhatsApp entrant vers la bonne session Managed Agent, résolue par le `phone_num` ou le LID WhatsApp de l'athlète en
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
proxy.ts                                # /admin + /api/admin/* : relit la session, staff seul (sinon /login, 401 ou 403 sur l'API) ; Node runtime
app/
  api/webhooks/whatsapp/route.ts        # entrée HTTP fine : (verif HMAC obligatoire) → parse → use-case → 200 (session.* → alerte, sinon routing)
  api/cron/whatsapp-watchdog/route.ts   # GET appelé par le cron Vercel (vercel.json), Bearer CRON_SECRET → checkGatewaySession
  api/coaching-data/[transport]/route.ts # endpoint MCP coaching-data statique (/api/coaching-data/mcp), bearer requis
  api/intervals/[transport]/route.ts    # endpoint MCP Intervals.icu statique (/api/intervals/mcp), bearer requis
  api/whatsapp/[transport]/route.ts     # endpoint MCP WhatsApp statique (/api/whatsapp/mcp), bearer requis
  api/admin/athletes/[athleteId]/session/route.ts  # POST : ouvre une session et repointe l'athlète
  api/admin/staff/route.ts              # POST inviter (email + rôles admin/coach) / DELETE retirer un membre (jamais soi-même), INI-85
  api/auth/[...all]/route.ts            # Better Auth (INI-85) : vérif des magic links, connexion Google + callback ; 503 si non configuré
  login/page.tsx                        # connexion admin : bouton Google, refus d'un compte non invité (?error=)
  connect/intervals/page.tsx            # page d'arrivée du magic link Intervals.icu (INI-69, INI-85) : à qui est le compte + bouton
  connect/intervals/start/route.ts      # GET : relit la session, pose le cookie de flow (state + vérificateur PKCE) → 303 vers l'autorisation Intervals
  connect/intervals/callback/route.ts   # GET : retour OAuth d'Intervals.icu → use-case → 303 vers done
  connect/intervals/done/page.tsx       # résultat de la connexion + bouton « Retourner sur WhatsApp »
  (admin)/admin/layout.tsx              # exige une session staff (sinon /login) ; sidebar shadcn (Athlètes, Équipe, Réglages, déconnexion)
  (admin)/admin/team/page.tsx           # l'équipe : membres (rôles, actif ou invité), inviter, retirer (INI-85)
  (admin)/admin/athletes/page.tsx       # liste (data-table TanStack, filtres et tri dans l'URL : ?q=&status=&sort=)
  (admin)/admin/athletes/[athleteId]/page.tsx  # fiche athlète : bloc session (live, première session, nouvelle session, historique)
  (admin)/admin/settings/page.tsx       # passerelle WhatsApp + réglages d'onboarding ; chaque page a ses _components/ (client)
  layout.tsx, page.tsx, globals.css     # minimal + Tailwind
src/
  config/config.ts                 # env zod (ANTHROPIC_API_KEY, DATABASE_URL, DB_ENCRYPTION_KEY, WHATSAPP_WEBHOOK_SECRET, MCP_BEARER_TOKEN, INTERVALS_BASE_URL?) — PAS les vars d'admin
  auth.ts                          # verifyWebhookSignature + verifyBearerToken (constant-time) : webhook OpenWA et MCP
  admin/guard.ts                   # requireAdmin(request) : relit la session dans chaque route admin → staff, ou 401/403/503
  identity/                        # Better Auth (INI-85, INI-87, voir « Identité ») : authEnv, betterAuth (config, plugin admin), auth (instance Neon, lazy),
                                   #   accounts (adapters athlete/staff via auth.api), magicLinks (lien capturé),
                                   #   sessions (whoIsSignedIn), magicLinkCapture, athleteEmail, authClient (navigateur)
  lib/utils.ts                     # cn() (clsx + tailwind-merge)
  components/ui/*                  # composants shadcn (button, card, table, badge, input, label, sidebar et ses dépendances)
  domain/
    athlete.ts                     # modèle métier Athlete + enum AthleteStatus (routing ; indépendants de @inigo/db)
    whatsappGateway.ts             # GatewaySession + GatewayAlert (santé de la passerelle, indépendants d'OpenWA)
    signedIn.ts                    # SignedIn : qui est connecté (indisponible, déconnecté, athlète, coach), indépendant de Better Auth
    staff.ts                       # StaffMember + enums StaffRole (admin, coach) et StaffStatus (invité, actif)
    brain.ts                       # SessionElements / RunningSession / BrainInventory (indépendants du SDK)
    coaching.ts                    # modèles métier de la donnée coaching (contrat de sortie des tools MCP) + inputs
    onboarding.ts                  # checklist « onboarding terminé » (11 items) + OnboardingFacts / OnboardingState + enum FtpStatus
  repositories/
    athleteRepository.ts           # PORT AthleteRepository (findBySender, rememberSender, findById, listAll, setSession, listSessions, registerOnboardingAthlete, completeOnboarding)
    drizzleAthleteRepository.ts     # ADAPTER Drizzle (requête inline) + toAthlete(row→modèle)
    onboardingSettingsRepository.ts # PORT : agent d'onboarding, coordinateur, code d'accès (singleton en base, édité dans l'admin)
    drizzleOnboardingSettingsRepository.ts # ADAPTER Drizzle du singleton onboarding_settings
    drizzleIntervalsCredentialStore.ts # ADAPTER IntervalsCredentialStore : setIntervalsCredential (secret chiffré, id en clair)
    drizzleAthleteRosterReader.ts  # ADAPTER Drizzle du port AthleteRosterReader : athlètes + plan (actif, sinon le plus récent) + dernière proposition, une requête (joins latéraux)
    drizzleOnboardingFactsReader.ts # ADAPTER Drizzle du port OnboardingFactsReader (profil + goals actifs + credential, une requête) + toOnboardingFacts
    staffRepository.ts             # PORT StaffRepository (list, create, remove) ; adapter : identity/accounts.ts (plugin admin)
    athleteAccountRepository.ts    # PORT AthleteAccountRepository (ensure) ; adapter : identity/accounts.ts (plugin admin)
  use-cases/
    routeInboundMessage.ts         # use-case de routing : une seule fonction publique execute()
    startAthleteSession.ts         # use-case admin : clone la session courante avec l'agent de son statut (INI-74), repointe l'athlète
    listAdminAthletes.ts           # use-case admin (lecture) : la liste des athlètes (plan et dernière proposition) ; PORT AthleteRosterReader
    loadAthleteSessions.ts         # use-case admin (lecture) : session live + historique + inventaire d'un athlète (null si inconnu)
    loadAdminSettings.ts           # use-case admin (lecture) : session et numéro de passerelle + réglages d'onboarding + inventaire
    settle.ts                      # settle(read) : une lecture qui échoue devient un message, pas une 500
    sendAthleteMessage.ts          # use-case : la seule façon de parler à l'athlète (chat + session de passerelle)
    readActivityStreams.ts         # use-case : fenêtre obligatoire + refus au-delà du plafond, jamais de troncature
    handleGatewaySessionEvent.ts   # use-case : webhook session.* OpenWA → alerte « down » / « recovered »
    checkGatewaySession.ts         # use-case watchdog : session enregistrée en Neon → GET OpenWA → alerte si pas ready
    registerNewAthlete.ts          # use-case : expéditeur inconnu → réponse fixe, ou athlète en onboarding + sa session (PORT ChatReplier)
    createAthleteLink.ts           # use-case : findById → accounts.ensure → issuer.issue (outil get_intervals_connect_link) ; PORT SignInLinkIssuer
    startIntervalsConnection.ts    # use-case : ce que montre la page (bouton vers Intervals, ou pourquoi elle ne peut pas), athlète lu dans la session
    listStaff.ts, inviteStaffMember.ts, removeStaffMember.ts  # use-cases admin de l'équipe (INI-85) ; PORT StaffRepository
    completeIntervalsConnection.ts # use-case : callback OAuth → token chiffré + tour `evenement: intervals_connecte` à l'agent d'onboarding
    assessOnboarding.ts            # use-case : état d'onboarding calculé (jamais stocké) ; PORTS OnboardingFactsReader + IntervalsAthleteReader
    blockAthlete.ts                # use-case : statut blocked + log de la raison (outil block_athlete, INI-66)
    handOffToCoordinator.ts        # use-case : onboarding complet → session du coordinateur + statut active, en un db.batch (INI-49)
  alerts/
    gatewayAlerter.ts              # PORT GatewayAlerter (notify ne throw jamais)
    logAndSlackAlerter.ts          # ADAPTER : log structuré [coach][alert] + Slack si SLACK_ALERT_WEBHOOK_URL
    slack.ts                       # POST Incoming Webhook (timeout 5s), l'URL n'apparaît jamais dans une erreur
  repositories/whatsappGatewayRepository.ts  # PORT : la session et le numéro WhatsApp de la passerelle (en base, pas en env)
  mappers/
    sessionElements.ts             # sessionElementsFrom : agent + l'environnement, le vault et la knowledge base (read_only) uniques de l'inventaire
    whatsappPayload.ts             # schémas zod + normalisation du payload OpenWA + senderPhone
  brain/managedAgents.ts           # FRONTIÈRE cerveau : appendUserMessage + readSession + createSession + listInventory
  mcp/
    repository/athleteDataRepository.ts  # accès Neon scopé par athlete (createDb → forAthlete(id)), mappe rows→modèles (domain/coaching) ; seul autre layer @inigo/db-aware
    tools/{index,result,profile,thresholds,goals,plan,adaptationLog,constraints,block}.ts  # tools MCP fins (reads + writes gated)
  whatsapp/
    client/                        # client REST OpenWA typé (POST send-text ; zéro retry, un envoi n'est pas idempotent ; GET session pour le watchdog)
    credentials.ts                 # lit OPENWA_BASE_URL/API_KEY dans l'env — JAMAIS dans configSchema (cf. §Admin)
    resolveClient.ts               # createOpenWaResolver() : résout le client à l'appel, pas au boot
    chatReplier.ts                 # ADAPTER ChatReplier : répond à un chat avant qu'un athlète existe
    mcp-tools/{index,result}.ts    # un seul tool : send_whatsapp_message(athleteId, text) — mapping pur, zéro décision
  intervals/
    client/                        # client REST Intervals.icu typé — transport seul, ajoute fields/limit, ne projette rien
    mappers/project.ts             # projection objet brut Intervals → modèle du coach (aucune décision)
    mcp-tools/{index,result,tools/*}.ts  # tools MCP Intervals fins ; chaque tool prend athleteId + résout un client par requête
    resolveClient.ts               # createIntervalsResolver(db, encKey, baseUrl) : getIntervalsCredential → déchiffre → IntervalsIcuClient (Bearer)
    oauth/                         # INI-69/73 : credentials de l'app (hors configSchema), client OAuth PKCE (oauth4webapi)
    intervalsAthleteReader.ts      # ADAPTER du port IntervalsAthleteReader : un GET profil Intervals → toBikeFtp (réglages Ride) + toBodyComplete (sexe, naissance, taille, poids)
  deps.ts                          # singleton lazy { config, brain, db, repo, athleteData, intervalsResolver }
# futur : src/services/…
```

## Contrat de routing (le flux)

1. `route.ts` lit le **corps brut** et vérifie **toujours** `X-OpenWA-Signature` (HMAC sur le corps
   brut, clé `WHATSAPP_WEBHOOK_SECRET`, obligatoire : sans elle la config ne se charge pas et toutes les
   requêtes, webhook, MCP, cron et admin, échouent) ; signature absente ou
   fausse → `401 invalid_signature`, y compris pour les événements `session.*`. Puis parse le JSON.
2. `routeInboundMessage.execute` : valide (zod), normalise l'enveloppe (wrappée
   `{event,data}` ou plate), **ignore** `fromMe` / groupes / non-message / messages sans texte.
3. Résout l'athlète par l'un ou l'autre de ses alias WhatsApp (`senderIdentity` → `findBySender`,
   voir « Identification d'un athlète »). Les
   décisions métier sont **retournées** en `RouteOutcome` (union) : athlète sans session
   (`no_session`), sender illisible (`invalid_sender`), alias en conflit avec les fiches (`sender_conflict`,
   loggé en erreur), athlète terminé (`athlete_ended`) ou bloqué (`athlete_blocked`) → route
   en 200. Seules les erreurs infra (Neon / Anthropic / passerelle / Intervals.icu pour l'état
   d'onboarding) throw → 502.
   **Expéditeur inconnu** (INI-45) → `registerNewAthlete` (`unknown_sender`) :
   - onboarding non réglé dans l'admin (`onboarding_settings` sans agent ou sans code) → `disabled`, ignoré ;
   - message sans le code d'accès → réponse fixe `NO_ACCESS_CODE_REPLY` au `chatId` reçu (`declined`), sans agent ;
   - avec le code → session de l'agent d'onboarding (`sessionElementsFrom` : environnement, vault et
     knowledge base `read_only` = les seuls de l'inventaire, sinon `misconfigured`), puis athlète `onboarding` + session insérés en **un** `db.batch`, puis
     premier message appendé. Deux premiers messages concurrents → `already_registered`.
4. Sur un athlète résolu avec session, l'enveloppe dépend du **statut** (INI-46, switch exhaustif) :
   `onboarding` → `formatOnboardingTurn` (ajoute `onboarding_fait:` / `onboarding_manquant:`, calculés
   par `assessOnboarding` à chaque message) ; `active` et `paused` → `formatTurn` ; `ended` → ignoré
   (`athlete_ended`) ; `blocked` → ignoré (`athlete_blocked`, INI-66), sans aucun effet de bord. **Onboarding complet** (INI-49) → `handOffToCoordinator` : session du coordinateur
   (`onboarding_settings.coordinator_agent_id`), puis statut `active` + bascule de session en **un**
   `db.batch` (`completeOnboarding`), et le message part à la nouvelle session via `formatHandoffTurn`
   (ligne `passation:`, ce tour seulement) → `handed_off`. Sans coordinateur utilisable → le message
   reste à la session d'onboarding (`handoff_not_configured`, warning). Le tour est résolu avant tout
   autre effet de bord (la passation est le seul, atomique). Puis enregistre ce que le message apprend
   (alias manquant ou changé, `chat_id`) en une écriture (`repo.rememberSender`) et **append** l'enveloppe à **sa** session via `brain.appendUserMessage` (dernier effet de bord → pas de doublon sur
   retry OpenWA). `inigo_athlete_id` = l'`athlete.id` interne (Neon), que l'agent repasse en
   argument `athleteId` aux tools du MCP athlete-data (`/api/coaching-data/mcp`) — **pas** l'id Intervals.icu.
   **Fire-and-forget** : on n'attend pas le run ; l'agent répond lui-même via le MCP WhatsApp
   de cette app (`send_whatsapp_message`). Le `chat_id` n'est **pas** dans l'enveloppe : il est
   persisté (`repo.rememberSender`) et résolu côté serveur au moment de l'envoi.

### Enveloppe d'un tour (`brain/taskEnvelope.ts`)

Chaque message transmis à un agent est une enveloppe ligne à ligne, construite depuis la fiche :

```
date_time: 2026-07-09 11:05 (jeudi)       # date et heure locales, fuseau de l'athlète (athlete.timezone)
inigo_athlete_id: <uuid>                  # athlete.id, la clé de tous les outils MCP
athlete_display_name: Thomas              # athlete.display_name, vide tant qu'inconnu
locale: fr                                # athlete.locale (fr par défaut)
<lignes propres au tour>                  # onboarding_fait / onboarding_manquant, ou passation:
message: "texte de l'athlète"             # JSON.stringify : toujours la dernière ligne
```

Le message est encodé en JSON : guillemets et retours à la ligne sont échappés, donc ce qu'écrit
l'athlète tient sur une ligne et ne peut jamais se faire passer pour une ligne d'enveloppe (par ex.
un faux `inigo_athlete_id:`). Le contrat est décrit dans le prompt du coordinateur et de l'agent
d'onboarding (« Contrat WhatsApp ») : toute modification de l'enveloppe se déploie avec ces deux
prompts. Le coordinateur reporte la date dans ses task-envelopes sous `date_du_jour`, que lisent les
spécialistes.

## Identification d'un athlète (WhatsApp)

La seule preuve d'identité est **l'adresse WhatsApp de l'expéditeur**, telle qu'OpenWA la relaie.
Pas de mot de passe : tout repose sur l'authenticité du webhook (HMAC
`X-OpenWA-Signature` vérifié sur chaque livraison, `WHATSAPP_WEBHOOK_SECRET` obligatoire : sans lui,
n'importe qui pourrait poster un payload au nom d'un athlète).

**Ce qu'OpenWA envoie** (moteur whatsapp-web.js, payload réel d'INI-20 rejoué dans
`routeInboundMessage.spec.ts`) : `data.from` est le JID brut de l'expéditeur, `data.chatId` celui de
la conversation (en 1:1, OpenWA pose `chatId = from` pour un message entrant). Le JID est soit
`<chiffres>@c.us` (un numéro), soit `<chiffres>@lid` (un LID : identifiant opaque de l'adressage
confidentiel de WhatsApp, **sans** numéro dans le payload). Pour un LID, OpenWA ajoute `senderPhone`
(chiffres, ou `null` s'il ne connaît pas le numéro) quand `RESOLVE_LID_TO_PHONE=true` est activé sur la
passerelle (**requis en prod**, désactivé par défaut). OpenWA ne sait pas faire l'inverse : un
message `@c.us` ne porte jamais le LID.

**Modèle (INI-64).** L'identité d'un athlète est `athlete.id`. Le numéro et le LID sont **deux alias
du même compte WhatsApp**, l'un ou l'autre pouvant manquer (un LID peut cacher le numéro, et le
cachera avec les noms d'utilisateur WhatsApp). On les garde tous les deux et on les apprend au fil des
messages, plutôt que de stocker un seul « from » : après une bascule vers le LID, un message revenu en
`@c.us` serait sinon perdu.

| Colonne | Rôle | Valeur | Écrite par |
|---|---|---|---|
| `phone_num` | alias (unique) | E.164 `+32475123456` : d'un JID `@c.us` / `@s.whatsapp.net` (domaine et suffixe `:device` retirés, `+` ajouté ; pas de normalisation), ou du `senderPhone` d'un LID | l'inscription, puis chaque message qui l'apporte ou le change |
| `whatsapp_lid` | alias (unique) | JID complet `10325252415590@lid` (suffixe `:device` retiré, domaine gardé pour ne jamais le confondre avec un numéro) | idem |
| `chat_id` | **adresse de réponse**, pas une identité | le JID de la conversation tel que reçu (`replyChatId` : `chatId`, sinon `from`) | chaque message entrant s'il a changé |

Au moins un alias est posé (CHECK `athlete_routing_key_check`).

**Règles** (`senderIdentity`, `findBySender`, `senderChanges` dans `routeInboundMessage`) :
1. **Lire les alias du message** : JID `@lid` → LID, plus le numéro de `senderPhone` s'il y en a un
   (les chiffres d'un LID ne sont **jamais** lus comme un numéro) ; JID numéro → numéro seul ;
   tout autre domaine (groupe, `status@broadcast`, newsletter) → `invalid_sender`. L'`author` d'un
   message (posteur d'un statut ou d'un groupe) n'est **jamais** pris pour l'expéditeur.
2. **Une recherche** : `whatsapp_lid = lid OR phone_num = phone`. Aucun athlète → inscription par
   code d'accès (`registerNewAthlete`, qui enregistre les deux alias s'ils sont connus) ; un athlète
   → c'est lui ; deux athlètes différents → `sender_conflict` : rien n'est transmis, erreur loggée,
   un opérateur corrige les fiches.
3. **Le LID prime** : il est lié au compte WhatsApp, alors qu'un numéro peut être réattribué. Un
   numéro connu qui arrive avec un **autre** LID que celui de la fiche est quelqu'un d'autre (numéro
   recyclé) : `sender_conflict` aussi, rien n'est transmis ni réécrit. Un LID connu n'est donc jamais
   remplacé automatiquement.
4. **Apprendre** : le LID s'il manque sur la fiche, le numéro s'il manque ou a changé derrière le
   même LID, et `chat_id`, en une écriture (`rememberSender`). Un alias absent du
   message n'efface jamais celui de la fiche. Rien à apprendre → aucune écriture.

**Limites qui restent** (sans lien possible, on ne devine pas) :
- un expéditeur LID dont la passerelle ne connaît pas le numéro (`senderPhone: null`, numéro caché)
  et dont le LID n'est sur aucune fiche est un inconnu : il passe par le code d'accès, et sa fiche
  n'aura que le LID ;
- un athlète qui change de numéro avant que son LID soit connu, puis écrit en `@c.us`, est aussi un
  inconnu ;
- un athlète qui recrée son compte WhatsApp (nouveau LID, même numéro) tombe en `sender_conflict` :
  corriger son LID à la main.

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
| `get_profile` | read | identité *sûre* (display_name, tz, locale, status) + `athlete_profile` + `constraints` actives (`athlete_constraint` : toutes les récurrentes + les datées non terminées, date du jour dans le tz de l'athlète ; champs vides omis). **Aucun** secret/PII (pas de phone, LID, chat_id, session/agent/memory ids). |
| `get_thresholds` | read | dernier `athlete_threshold` par sport (FTP, HR, zones…). Filtre `sport?`. |
| `get_goals` | read | `goal` filtrés (`status?`, défaut active). |
| `get_training_plan` | read | plan courant + `plan_block` ordonnés (weekly targets). |
| `get_adaptation_log` | read | journal (`limit?` défaut 5, max 30, `since?`), plus récent d'abord. |
| `update_profile` | write | `displayName` (écrit sur `athlete`) + upsert notes/prefs (`weightTargetKg`, `weeklyHours`, `equipment`, `constraintsNotes`, `healthNotes`, `coachingTargets`) + réponses d'onboarding (`motivation`, `trainingBackground`, `pastCoaching`, `coachExpectations`, `ftpStatus`, `educationDone`). |
| `upsert_constraint` | write | create / **replace-all** (`id`) d'une règle d'horaire : `kind` (`fixed_session` \| `unavailable` \| `limited`), récurrente (`weekday` 1-7) **ou** datée (`startDate`..`endDate`). Règle validée par le use-case `saveAthleteConstraint`, puis par les CHECKs DB. Pas de tool de lecture : `get_profile` la renvoie. |
| `delete_constraint` | write | supprime une règle (scopée par athleteId). Une datée terminée n'a pas besoin d'être supprimée. |
| `block_athlete` | write | passe l'athlète en `blocked` (INI-66) : tentative de détournement ou demande hors coaching, décidée par l'agent après son message de clôture. `reason` requis, loggé (`[coach] athlete … blocked: …`), pas stocké. Ensuite le routing n'envoie plus rien. Déblocage : UPDATE manuel du statut. |
| `log_adaptation` | write | append au journal (`summary` requis). |
| `upsert_goal` | write | create/update d'un `goal`, dont `targetResult` (ce qu'il vise) et `experience` (déjà fait ? tentatives ?) (update scopé par athleteId). |
| `save_training_plan` | write | create (sans `id`) / update (`id`) du `training_plan` **+** ses `plan_block` en une écriture atomique (`db.batch`). Blocs en **replace-all** (`order_index` recalculé) ; `status=active` archive les autres plans actifs ; update scopé par athleteId (jamais le plan d'un autre). Dates I/O en `YYYY-MM-DD`. |

**Frontière athlete-data ⟂ intervals-icu (à respecter dans les prompts d'agents) :**
- **athlete-data (Neon, ce MCP)** = *couche coaching* : profil structuré, seuils **historisés**,
  objectifs, macro-plan/blocs, contraintes, santé, cibles de coaching, journal d'adaptation.
- **intervals-icu** = *vérité quantifiée live* : activités, PMC du jour (CTL/ATL/TSB via
  `get_fitness`), courbes puissance/FC/allure, **calendrier des séances planifiées**, FTP/zones
  *calculées* par Intervals, et la **physiologie** (sexe, date de naissance, taille, poids, FC
  repos/max). INI-62 : Neon ne stocke que le coaching qu'Intervals n'a pas ; la physiologie n'est
  **jamais** copiée dans `athlete_profile`. Si elle manque, l'agent d'onboarding la demande sur
  WhatsApp et l'écrit sur Intervals (`update_athlete_body`). Règle FTP : décision coaching = `athlete_threshold` (ce MCP) ;
  Intervals reste le calcul live.

## MCP Intervals.icu (le brain lit/écrit Intervals via coach) — INI-7

Un **second** serveur MCP hébergé dans coach (`POST/GET /api/intervals/mcp`, `basePath:
"/api/intervals"`), **distinct** de l'athlete-data (`/api/coaching-data/mcp`). Rapatrié depuis l'ex-app
standalone `intervals-icu-mcp` pour passer en **multi-athlète** : l'accès Intervals.icu n'est
plus une seule clé en env, mais **un token OAuth par athlète** stocké chiffré dans Neon
(`athlete_credential`, cf. `@inigo/db`).

- **Token par athlète, résolu au moment de l'usage** : chaque tool prend un `athleteId` (le même
  `inigo_athlete_id` que coach-data — l'id Inigo, **pas** l'id Intervals). Le handler résout un
  client **par requête** via `createIntervalsResolver` : `getIntervalsCredential(db, athleteId, DB_ENCRYPTION_KEY)`
  → déchiffre le token + lit l'id Intervals externe → `new IntervalsIcuClient(...)`. Le secret est
  déchiffré **dans coach**, jamais renvoyé au brain ni au LLM.
- **Absence de token** : le resolver `throw` (message clair, sans secret) → `errorResult` du tool.
- **Accès perdu** (INI-71) : un 401 ou 403 d'Intervals.icu devient `ACCESS_LOST_MESSAGE` dans
  `errorResult` (envoyer un nouveau lien), jamais l'erreur brute. Aucun état en base.
- **Deux endpoints, pas un** : choix assumé pour garder le **nom de serveur brain `intervals-icu`**
  et les **allowlists de toolset par agent** (coordinateur = read-only, constructeur/réadaptateur =
  full) inchangées. Seule l'URL du serveur `intervals-icu` bascule (ops, post-deploy) vers
  `https://app.inigo-coach.com/api/intervals/mcp`.
- **Auth** : même bearer global `MCP_BEARER_TOKEN` que coach-data (`withMcpAuth({ required: true })`).
- **Écriture d'un credential** : `setIntervalsCredential` (`@inigo/db`) — écriture chiffrée +
  rotation (`rotatedAt`) du token OAuth (Bearer). Seul chemin : le lien OAuth (INI-69, voir plus
  bas). INI-72 a retiré la clé API (outil `connect_intervals`, HTTP Basic) et la colonne
  `auth_type`.

## Connexion Intervals.icu par OAuth — INI-69, INI-73

L'athlète connecte son compte depuis un lien, sans jamais coller de clé dans WhatsApp.

1. L'agent (onboarding, ou coordinateur pour une reconnexion) appelle `get_intervals_connect_link(athleteId)` et envoie le lien :
   un **magic link Better Auth** (INI-85, voir « Connexion »), valable 1 h, à usage unique.
2. Le clic passe par `GET /api/auth/magic-link/verify`, qui ouvre la session de l'athlète et redirige
   vers `GET /connect/intervals` (page publique, hors `proxy.ts`) : `startIntervalsConnection` lit
   l'athlète **dans la session**, la page dit **à qui** est le compte (prénom, deux derniers chiffres
   du WhatsApp) et propose le bouton. Un lien déjà utilisé ou expiré revient avec `?error=` : la page
   s'affiche quand même si ce navigateur a déjà la session (deuxième clic), sinon « lien expiré ».
3. `GET /connect/intervals/start` : relit la session, tire un flow (`state` aléatoire et un
   vérificateur PKCE), le garde dans un cookie (HttpOnly, Secure, Lax, 15 min, path
   `/connect/intervals`) et redirige vers `intervals.icu/oauth/authorize` (scopes
   `ACTIVITY:READ,WELLNESS:WRITE,CALENDAR:WRITE,SETTINGS:WRITE`, `state`, `code_challenge` S256).
4. `GET /connect/intervals/callback?code&state` : `completeIntervalsConnection` exige le flow du
   cookie (`session_mismatch` sinon) et un athlète connecté sur ce navigateur, puis le client OAuth
   (`oauth4webapi`) exige que le `state` reçu soit celui du cookie et échange le code avec le
   vérificateur PKCE (`POST /api/oauth/token`, form-encoded, moins de 2 min). Le use-case exige
   tous les scopes, refuse un **autre** compte Intervals que
   celui déjà relié (`other_account`), stocke le token (`athlete_credential`, remplace le précédent), puis réveille
   l'agent de l'athlète (tour `evenement: intervals_connecte`, `message` vide) : l'onboarding avec sa
   checklist, ou le coordinateur seul pour un athlète actif ou en pause qui se reconnecte (INI-71). Puis 303 vers
   `/connect/intervals/done?result=<ConnectionResult>`, qui propose `wa.me/<numéro d'Inigo>`.

Règles :
- **Bibliothèques, pas de crypto maison** (INI-73, INI-85) : Better Auth pour le lien et la session,
  `oauth4webapi` pour le flow (PKCE, contrôle du `state`, échange, validation de la réponse). Le code
  à nous se limite aux règles d'Inigo (titulaire, clic depuis la page, autre compte, scopes).
- **Qui connecte** : l'athlète de la session ouverte par le magic link, relue à la page, au `start`
  et au callback. Le `state` OAuth n'en porte rien (aléatoire).
- **Liaison au navigateur (anti login CSRF, anti injection de code)** : la session prouve « cet
  athlète », le flow prouve « ce navigateur a commencé ce flow ». Le cookie de flow
  (`app/connect/intervals/_components/connection-flow.ts`) garde le `state` et le vérificateur
  PKCE : une URL d'autorisation forgée, ouverte ailleurs, ou un code volé ne relient rien. Une fois
  le premier flow réel réussi (INI-70), cocher « Require PKCE » sur l'app Intervals.icu. Et
  `/start` n'accepte que le clic depuis la page (`Sec-Fetch-Site: same-origin`, sinon `Referer` de
  même origine, la page étant en `referrer: same-origin`) : un lien direct vers `/start` est renvoyé
  à la page, qui montre le titulaire. Un lien
  transféré reste un risque résiduel : la page affiche donc le titulaire, et un compte Intervals
  déjà relié n'est jamais remplacé par un autre.
- **Credentials de l'app hors `configSchema`** (`intervals/oauth/credentials.ts`) :
  `INTERVALS_OAUTH_CLIENT_ID`, `INTERVALS_OAUTH_CLIENT_SECRET`, `COACH_PUBLIC_URL`. Absents → l'outil
  répond `oauth_unavailable` (l'agent dit que la connexion est momentanément indisponible), les
  pages disent « indisponible ». Le
  webhook et les MCP ne sont jamais touchés.
- **Rien n'est écrit** si : refus (`access_denied`), aucun athlète connecté sur ce navigateur, autre navigateur,
  athlète inconnu, `ended` ou `blocked`, code refusé, scope décoché, autre compte Intervals. Une panne (Intervals, Neon) throw → la route
  logge et affiche `failed`, jamais une 500.
- **Le réveil de l'agent ne fait jamais échouer la connexion** : elle est déjà stockée. Seul un
  athlète `onboarding` est réveillé (le coordinateur ne connaît pas l'événement, cf. INI-71).
- **Pas de refresh token** chez Intervals.icu, ni d'expiration documentée. Révocation détectée au
  premier 401 : INI-71. L'athlete id renvoyé par le token est normalisé en `i…`.
- **Redirect URI** : `<COACH_PUBLIC_URL>/connect/intervals/callback`, à enregistrer sur l'app
  (pas de wildcard chez Intervals, donc pas de flow complet sur les previews Vercel ; `localhost`
  est toujours autorisé).
- **Numéro WhatsApp d'Inigo** : `whatsapp_gateway.whatsapp_number` (INI-79), édité dans /admin,
  Réglages, carte Passerelle WhatsApp (`POST /api/admin/whatsapp-number`, 409 tant qu'aucune
  session n'est enregistrée).
  Absent ou Neon illisible → la page n'a simplement pas de bouton.

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

## Surveillance de la session WhatsApp — INI-40

Une session OpenWA qui tombe, c'est un athlète qui écrit dans le vide. Deux détections, une
seule sortie (`GatewayAlerter`, Slack + log). **La logique produit se lit dans les `switch`** :
enums dans `domain/whatsappGateway.ts` (`GatewaySessionStatus`, `GatewaySessionEvent`,
`GatewayAlertSeverity`), une fonction `decide…` par table, `return` précoces, pas de `if` imbriqué.
Un nouveau statut OpenWA ajouté à l'enum casse la compilation tant qu'il n'a pas sa ligne.

**Abonnements du webhook côté OpenWA** : `message.received`, `session.status`,
`session.disconnected`, `session.reconnect_loop`, `session.restriction`. Pas `session.qr` (un QR
ne doit jamais partir dans Slack) ni `session.authenticated` (redondant avec `ready`).

**Webhook (`handleGatewaySessionEvent`), session enregistrée en Neon :**

| Événement / statut | Sévérité | Code |
|---|---|---|
| `session.status` `ready` | ignoré, loggé (rien à faire, INI-41) | |
| `session.status` `disconnected` (coupure **ou stop**) | down | `session_disconnected` |
| `session.status` `failed` | down | `session_failed` |
| `session.status` `qr_ready` | needs_human | `session_qr_ready` |
| `session.status` `action_required` | needs_human | `session_action_required` |
| `session.status` `created` / `initializing` / `authenticating` | ignoré (transitoire) | |
| `session.status` inconnu | ignoré, valeur loggée | |
| `session.disconnected` (coupure seulement, jamais un stop) | down, avec la raison | `session_dropped` |
| `session.reconnect_loop` (toutes les 5 tentatives) | down | `session_reconnect_loop` |
| `session.restriction` actif / levé | down / recovered | `session_restricted` / `session_restriction_lifted` |

**Slack ne porte que ce qui demande d'agir** (INI-41) : le retour en `ready` n'est jamais posté.
Une reconnexion silencieuse d'OpenWA (`initializing` → `ready`) postait un « session is back »
pour une panne jamais annoncée. Si la session ne revient pas, le watchdog le dit.

Une coupure envoie `session.disconnected` **et** `session.status disconnected` : deux messages
(la raison, puis l'état), choix assumé. Un stop n'envoie que le statut. **Autre session** (l'ancienne
après un ré-appairage) : tout est ignoré, sauf `ready` → needs_human `unrecorded_session_ready`
(le coach envoie encore par l'ancienne : mettre à jour l'admin). Neon illisible → l'événement compte
comme celui de la session enregistrée (on alerte plutôt que se taire).

**Watchdog (`checkGatewaySession`, cron Vercel `0 7 * * *`, Hobby = un run par jour)** :
`decideWatchdogAction(status)` :

| Statut | Action |
|---|---|
| `ready` | rien |
| `disconnected`, `failed` | **un** `POST /api/sessions/:id/start` + alerte `session_restarted` (échec → `restart_failed`) |
| `qr_ready`, `action_required` | alerte needs_human (une relance ne ferait qu'un QR) |
| `created`, `initializing`, `authenticating`, inconnu | alerte `session_stuck` |

Plus, sans statut à lire : `no_session_recorded`, `session_not_found` (404), `gateway_unreachable`
(injoignable ou non configuré). Le résultat d'une relance arrive en temps réel par les webhooks.
**Jamais de relance depuis le webhook** : un start qui échoue aussitôt ferait une boucle
start → failed → start ; le planning du cron sert de limite de débit.

Règles :
- **L'alerter ne throw jamais.** Un échec Slack est loggé, jamais propagé : sinon le webhook
  répondrait une erreur, BullMQ rejouerait l'événement et on alerterait en boucle.
- **Secrets lus là où ils servent**, jamais dans `configSchema` (même raison qu'`openWaCredentials`) :
  `SLACK_ALERT_WEBHOOK_URL` (absente → log seul), `CRON_SECRET` (absente → la route refuse, 503 ;
  mauvais bearer → 401). Vercel envoie lui-même `Authorization: Bearer $CRON_SECRET` à ses crons.
- **Texte des alertes en anglais**, sans tiret (`-`, `—`) dans ce que lit l'humain.

Hors scope (à reprendre si besoin) : réconciliation des messages après un unlink (OpenWA stocke
l'historique rapatrié sans webhook), déduplication par `waMessageId`.

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
- **Lectures résilientes** : `loadAthleteSessions` et `loadAdminSettings` capturent chaque
  lecture externe (`settle`) au lieu d'avorter — un pointeur vers une session supprimée est justement
  la dérive que cette page doit rendre visible. Même règle que les lectures de `@inigo/brain`.
- **Ordre des effets** : la session est créée **avant** l'écriture du pointeur, donc un échec
  Anthropic laisse l'athlète sur sa session précédente plutôt que orphelin. `setSession` écrit
  aussi `managed_agent_id`, pour que l'historique dise toujours quel agent tournait vraiment.
- **Ce qui reste dans `tooling/brain`** : appliquer les configs d'agents depuis le snapshot et
  re-pinner le roster (Vercel n'a pas le snapshot git). L'admin ouvre la session, rien de plus.
- **Auth** (INI-85, voir « Connexion ») : session Better Auth d'un membre du **staff** (Google, sur
  invitation). `proxy.ts` (matcher `/admin` et `/api/admin/*` seulement) **relit la session** à
  chaque requête, navigation client comprise : staff → OK, déconnecté → `/login` ou 401, athlète →
  `/login` ou 403, non configuré → 503. Le layout admin et chaque route (`requireAdmin`) revérifient.
  Ne jamais réduire le proxy à un test de présence du cookie : une session d'athlète est une session
  valide, et Next ne rejoue pas un layout en navigation client (un segment de page se lit sans lui).
- **L'ADMIN NE DOIT JAMAIS POUVOIR CASSER LE COACH.** Ses identifiants ne sont **pas** dans le
  schéma de `config.ts` : ce schéma est parsé sur *chaque* chemin de requête, donc n'importe
  quelle règle sur l'admin (absent, ou juste trop court) fait tomber le webhook WhatsApp et les
  deux MCP avec elle. C'est arrivé (ex `ADMIN_PASSWORD` trop court, avant INI-85) : webhook 500 et
  MCP 401 malgré un bearer valide. Les variables de connexion (`BETTER_AUTH_*`, `GOOGLE_CLIENT_*`)
  sont lues et validées là où elles servent (`authEnv()`), qui échoue fermé → 503 côté admin, liens
  athlètes indisponibles, rien ailleurs. **N'ajoute jamais de variable propre à l'admin dans
  `configSchema`.** Gardé par les specs des routes webhook et MCP, qui tournent avec une connexion
  volontairement inutilisable (`BETTER_AUTH_SECRET` trop court, pas de client Google).

## Identité : qui se connecte, et qui crée les users — INI-85, INI-87

**La règle : un user n'est jamais créé en se connectant.** Il est créé (et supprimé) **uniquement
par un use-case**, via l'API publique du plugin `admin` de **Better Auth**. Se connecter (Google
pour le staff, magic link pour l'athlète) ne fait qu'**authentifier un user qui existe déjà**. La
config Better Auth (`identity/betterAuth.ts`) est de la **plomberie** : aucun hook, aucune règle
métier, aucune vérification de rôle.

### Une table d'identité : `auth_user`

| Colonne | Athlète | Staff (backoffice) |
|---|---|---|
| `role` (plugin admin) | `athlete` | `admin`, `coach` ou `admin,coach` |
| `athlete_id` | FK unique vers `athlete` (`on delete cascade`) | null |
| `email` | `<athlete.id>@athletes.inigo.betterauth` (étiquette, aucun mail envoyé, jamais relue) | son email Google, en minuscules |
| `email_verified` | true | false = **invité**, true = **actif** (Google l'a vérifié en liant son compte) |
| `invited_by` | null | email du membre qui l'a invité |

CHECK : rôle dans ces 4 valeurs ; `role = 'athlete'` ⇔ `athlete_id` renseigné ; email en
minuscules. Les sessions (`auth_session`) et le compte Google (`auth_account`) tombent avec le user
(cascade). Colonnes `banned`, `ban_*`, `impersonated_by` : exigées par le plugin, inutilisées.

### Qui crée quoi

```
ATHLÈTE (tout part de WhatsApp)
  agent ──get_intervals_connect_link──▶ createAthleteLink(athleteId, destination)
      1. destination → chemin (enum fermée : intervals_connect → /connect/intervals)
      2. repo.findById(athleteId)                  (AthleteRepository, Drizzle)
      3. accounts.ensure(athlete)                  (AthleteAccountRepository → auth.api.createUser,
                                                    rôle athlete + athleteId ; idempotent, course comprise)
      4. issuer.issue(athleteId, chemin)           (SignInLinkIssuer → auth.api.signInMagicLink, capturé)
  athlète clique ──▶ /api/auth/magic-link/verify ──▶ session ──▶ /connect/intervals

STAFF (sur invitation, sans email)
  /admin/team ──▶ inviteStaffMember(email, rôles, invitedBy)
      1. rôles dédupliqués, au moins un
      2. staff.create(...)                         (StaffRepository → auth.api.createUser, au nom du membre connecté)
  → bouton « Copier le lien » (/login), envoyé à la main
  invité ──Google──▶ /api/auth/callback/google ──▶ compte Google lié à SON user existant ──▶ session
  /admin/team ──▶ removeStaffMember(email, by) ──▶ staff.remove ──▶ auth.api.removeUser (sessions incluses)
  /admin/team ──▶ listStaff() ──▶ staff.list ──▶ auth.api.listUsers (rôle ≠ athlete)
```

Adapters : `identity/accounts.ts` (`betterAuthAthleteAccounts`, `betterAuthStaff`, et leurs
fabriques `athleteAccountsOnDeployment` / `staffOnDeployment`), `identity/magicLinks.ts`
(`magicLinkIssuer`). Ils n'utilisent que `auth.api`, jamais les tables Better Auth directement.

### Better Auth, la config (plomberie)

- **Google** `disableSignUp: true` : un compte non invité → `/login?error=signup_disabled`, aucun user.
  `accountLinking.requireLocalEmailVerified: false` pour que Google se lie au user invité (email pas
  encore vérifié) ; sans risque ici, personne ne peut s'inscrire.
- **Magic link** `disableSignUp: true`, 1 h (`MAGIC_LINK_TTL_SECONDS`), jeton haché, usage unique
  (imposé par Better Auth). `sendMagicLink` n'envoie rien : il dépose l'URL dans la capture
  (`AsyncLocalStorage`, `identity/magicLinkCapture.ts`) ouverte par `magicLinkIssuer` ; hors capture,
  il échoue. Expiré ou réutilisé → `?error=INVALID_TOKEN` : la page dit « lien expiré », sauf si ce
  navigateur a déjà la session (deuxième clic).
- **Plugin `admin`**, contrôle d'accès natif : `admin` et `coach` ont **les mêmes permissions**
  (créer avec un rôle, lister, supprimer des users et leurs sessions) ; `athlete` aucune. Les
  différencier est une décision produit à venir, qui se fera dans `ROLES`.
- **`disabledPaths`** : `/sign-in/magic-link` et **toutes** les routes HTTP `/admin/*` du plugin.
  Tout passe par nos routes et nos use-cases ; `auth.api` reste appelable côté serveur.
- **Instance** : `identity/auth.ts`, construite à la première utilisation, variables hors
  `configSchema` (`authEnv`), adaptateur Drizzle sur `neon-http` (`transaction: false`).

### Lire la session

Toujours `whoIsSignedIn(headers)` (`identity/sessions.ts`) → `SignedIn` (`domain/signedIn.ts`) :
`athlete` (lu par la FK `athleteId`, jamais par l'email), `staff` (rôle `admin`/`coach`),
`signed_out`, `unavailable`. Jamais Better Auth directement dans un use-case. `proxy.ts`, le layout
admin et `requireAdmin` ne laissent passer que le staff. Les specs de route mockent
`identity/sessions` par `identity/sessions.fake.ts` (`AS_STAFF`, `AS_ATHLETE`…).

### À savoir

- **Tester par le vrai chemin** : `identity/betterAuth.spec.ts` passe par le handler HTTP (sign in
  Google + callback, token Google simulé par msw ; magic links). Un test qui crée des users par les
  internals de Better Auth saute sa validation : c'est ainsi qu'INI-85 a cassé la connexion en prod.
- `listUsers` du plugin renvoie une liste vide (pas une erreur) si la base tombe. Comme le membre
  qui agit est lui-même un user, `betterAuthStaff` traite une liste qui ne le voit même pas comme
  une panne : la page Équipe affiche « Équipe illisible », un retrait répond 502, jamais « personne »
  ni « pas membre ».
- Le nom (et la photo) Google d'un membre sont copiés sur son user quand son compte se lie
  (`accountLinking.updateUserInfoOnLink`) : invité, il n'a pas de nom.
- **Aperçus de lien** : la vérification d'un magic link est un `GET`. Si la passerelle ou WhatsApp
  ouvrent l'URL pour un aperçu, le jeton est consommé avant le clic : à vérifier en prod.
- **Pas de connexion Google sur les previews Vercel** (Google refuse les URL joker) : prod et local.

## Conventions (en plus de la racine)

- **Frontière cerveau** : tout passe par `ManagedAgentBrain` (`src/brain/managedAgents.ts`).
  Un futur backend maison / maillage d'agents implémente cette interface — rien d'autre ne bouge.
- **Toute la logique métier vit dans des use-cases** (`src/use-cases/`) exposant une seule
  fonction publique `execute`. Les routes restent minces (HTTP only).
- **Accès données via un port `repository`** : le use-case ne dépend que de l'interface
  (`repositories/athleteRepository.ts`), jamais de l'ORM. Deux couches seulement connaissent
  `@inigo/db` : l'adapter Drizzle du routing (rows → **modèles métier** `domain/`), et le
  repository MCP (`src/mcp/repository/athleteDataRepository.ts`) qui mappe rows→modèles (`domain/coaching.ts`).
- **Multi-athlète** : le routing résout l'athlète + sa session par `phone_num` ou LID en base (Neon). Règles et limites : voir « Identification d'un athlète (WhatsApp) ».
  Plus de session fixe en env ; pas de mapping en mémoire locale.
- Secrets : env serveur uniquement, validés au boot, jamais en log.
- **TanStack Table : tout ce qu'on lui passe garde sa référence entre deux rendus** : `data`,
  `columns` et les valeurs de `state` (`sorting`…), en constante de module ou en `useMemo`. Un
  tableau recréé à chaque rendu (`data: rows.filter(...)`, `sorting` relu de l'URL) relance le
  calcul des lignes, qui remet la pagination à zéro, qui fait un rendu : boucle infinie, onglet
  figé (prod, INI-52). `athletes-table.spec.tsx` le garde, avec et sans `?sort=`.

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
- Composants client : `*.spec.tsx` avec `// @vitest-environment happy-dom` en tête de fichier
  (le reste tourne en `node`), rendus avec `react-dom/client` + `act`, `next/navigation` mocké.
- Couvre : config (dont `MCP_BEARER_TOKEN` ; et le fait qu'elle **ignore** les vars de connexion),
  auth (HMAC + bearer), **Better Auth par son vrai chemin** (`identity/betterAuth.spec.ts`, adaptateur
  mémoire, Google simulé par msw : Thomas lié et actif, compte non invité refusé sans user créé,
  membre retiré refusé ; user athlète créé une fois, lien → session, usage unique, expiration à 1 h,
  pas de user sans lien ; session athlète sans pouvoir sur l'équipe ; `/admin/*` et
  `/sign-in/magic-link` en 404), `whoIsSignedIn`, `magicLinkIssuer`, `createAthleteLink`, les use-cases staff (rôles, jamais soi-même), le proxy (athlète refusé, RSC compris),
  **routes webhook et MCP bootées avec une connexion inutilisable** (la régression de prod),
  parsing/normalisation du payload + `senderPhone`, mapping `toAthlete` / `toAthleteSession`
  (intégration Neon, skippée sans `DATABASE_URL` : bascule de session qui garde l'ancienne,
  deuxième session active refusée par la DB), **use-case
  `routeInboundMessage`** (4 cas de routing + filtres + throws infra, repo & brain fakes),
  brain (fake SDK : append, readSession qui retire les champs output-only, createSession,
  listInventory), **`startAthleteSession`** (clone nominal, éléments ignorés quand il y a une
  session, ressources reportées telles quelles, première session depuis des éléments choisis,
  préfixes d'ids refusés, athlète inconnu, échec de lecture ou de création qui n'écrit rien, agent choisi selon le statut, `ended`/`blocked` refusés, agent non réglé) et
  **`loadAthleteSessions`** (athlète inconnu, session cassée rendue visible, inventaire injoignable qui
  dégrade au lieu de casser, historique sans la session active), **`loadAdminSettings`** (chaque
  réglage illisible dégrade seul) et **`listAdminAthletes`** (la liste dans l'ordre du reader). Routes admin : 401 sans session, 403 session d'athlète, 503 connexion non configurée, 400 UUID
  invalide, 200 clone, 200 première session, 409 sans rien à cloner, 409 athlète bloqué, 404, 502. Côté MCP :
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
