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
  api/webhooks/whatsapp/route.ts   # entrée HTTP fine : (verif HMAC optionnelle) → parse → use-case → 200
  layout.tsx, page.tsx             # minimal
src/
  config/config.ts                 # env zod (ANTHROPIC_API_KEY, DATABASE_URL, DB_ENCRYPTION_KEY, WHATSAPP_WEBHOOK_SECRET?)
  auth.ts                          # verifyWebhookSignature (HMAC-SHA256 constant-time, X-OpenWA-Signature)
  domain/athlete.ts                # modèle métier Athlete + enum AthleteStatus (indépendants de @inigo/db)
  repositories/
    athleteRepository.ts           # PORT AthleteRepository (findByPhone, setChatId)
    drizzleAthleteRepository.ts     # ADAPTER Drizzle (requête inline) + toAthlete(row→modèle)
  use-cases/
    routeInboundMessage.ts         # LE use-case : une seule fonction publique execute()
  mappers/
    whatsappPayload.ts             # schémas zod + normalisation du payload OpenWA + senderPhone
  brain/managedAgents.ts           # FRONTIÈRE cerveau : appendUserMessage(sessionId,text) + adaptateur SDK
  deps.ts                          # singleton lazy { config, brain, db, repo }
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
   formate `chat_id: <jid>\nmessage: <body>` et **append** à **sa** session via
   `brain.appendUserMessage` (dernier effet de bord → pas de doublon sur retry OpenWA).
   **Fire-and-forget** : on n'attend pas le run, l'agent répond via son MCP OpenWA
   (tools exécutés server-side via le vault).

## Conventions (en plus de la racine)

- **Frontière cerveau** : tout passe par `ManagedAgentBrain` (`src/brain/managedAgents.ts`).
  Un futur backend maison / maillage d'agents implémente cette interface — rien d'autre ne bouge.
- **Toute la logique métier vit dans des use-cases** (`src/use-cases/`) exposant une seule
  fonction publique `execute`. Les routes restent minces (HTTP only).
- **Accès données via un port `repository`** : le use-case ne dépend que de l'interface
  (`repositories/athleteRepository.ts`), jamais de l'ORM. L'adapter Drizzle est la seule
  couche qui connaît `@inigo/db`, et mappe les rows sur les **modèles métier** (`domain/`),
  indépendants des types DB.
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
- Couvre : config, auth (HMAC), parsing/normalisation du payload + `senderPhone`, mapping
  `toAthlete`, **use-case `routeInboundMessage`** (4 cas de routing + filtres + throws infra,
  repo & brain fakes), brain (fake SDK). Pas de réseau (fakes injectés).
- La spec d'intégration de l'adapter Drizzle (`*.integration.spec.ts`) tourne contre une vraie
  branche Neon et se **skip** sans `DATABASE_URL`, donc `pnpm verify` reste offline.
- `pnpm verify` (racine) doit être vert avant tout commit.
