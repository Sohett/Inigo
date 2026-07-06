# coach — guide agents

Backend d'Inigo (Next.js full-stack, Vercel). Complète l'`AGENTS.md` racine. Contexte
humain / déploiement / setup : `README.md`.

## Rôle & principe

App **full-stack unique** : le **backend** (route handlers `app/api/*` + logique `src/`) et,
plus tard, l'**admin** (pages sous `app/(admin)/…`) vivent ensemble. Aujourd'hui, une seule
capacité : le **mapper** WhatsApp → event Managed Agent.

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
  api/webhooks/whatsapp/route.ts   # entrée HTTP fine : (verif HMAC optionnelle) → parse → mapper → 200
  layout.tsx, page.tsx             # minimal
src/
  config/config.ts                 # env zod (ANTHROPIC_API_KEY, ANTHROPIC_SESSION_ID, WHATSAPP_WEBHOOK_SECRET?)
  auth.ts                          # verifyWebhookSignature (HMAC-SHA256 constant-time, X-OpenWA-Signature)
  mappers/
    whatsappToAnthropicManagedAgentsMapper.ts   # LE mapper (fire-and-forget)
    whatsappPayload.ts             # schémas zod + normalisation du payload OpenWA
  brain/managedAgents.ts           # FRONTIÈRE cerveau : appendUserMessage(sessionId,text) + adaptateur SDK
  deps.ts                          # singleton lazy { config, brain }
agent-skills/                      # skills attachées au Managed Agent (uploadées côté Anthropic, PAS des skills Claude Code)
  intervals-icu-workouts/          # syntaxe du workout builder Intervals.icu (SKILL.md + reference/)
# futur : app/(admin)/… , app/api/admin/… , src/services/…
```

## Contrat de mapping (le flux)

1. `route.ts` lit le **corps brut** ; si `WHATSAPP_WEBHOOK_SECRET` est set, vérifie
   `X-OpenWA-Signature` (HMAC sur le corps brut) ; sinon skip. Parse le JSON.
2. `whatsappToAnthropicManagedAgentsMapper` : valide (zod), normalise l'enveloppe
   (wrappée `{event,data}` ou plate), **ignore** `fromMe` / groupes / non-message /
   messages sans texte.
3. Formate `chat_id: <jid>\nmessage: <body>` et **append** à la session fixe via
   `brain.appendUserMessage`. **Fire-and-forget** : on n'attend pas le run, on ne lit pas
   la réponse — l'agent répond via son MCP OpenWA (tools exécutés server-side via le vault).

## Conventions (en plus de la racine)

- **Frontière cerveau** : tout passe par `ManagedAgentBrain` (`src/brain/managedAgents.ts`).
  Un futur backend maison / maillage d'agents implémente cette interface — rien d'autre ne bouge.
- **Routes minces, logique dans `src/`** → extraction facile si un jour on split backend/admin.
- **Single-user assumé** : une session fixe (pas de mapping numéro→session, pas de store).
  Multi-user = ajouter un store (Upstash) + mapping ; ne pas anticiper avant le besoin.
- Secrets : env serveur uniquement, validés au boot, jamais en log.

## Hypothèses à vérifier au bring-up (documentées, non devinées)

- **Enveloppe du webhook OpenWA** : `whatsappPayload.ts` est tolérant (accepte `{event,data}`
  ou message plat ; texte dans `body` ou `text`). Confronter à une vraie livraison
  (webhook.site) et resserrer si besoin.
- **Outil d'envoi MCP** = `MessageSendText` (confirmé via `tools/list`), exige `sessionId`
  (UUID de session OpenWA) + `chatId` + `text` → géré dans le **prompt système de l'agent**.

## Skills du Managed Agent

`agent-skills/` regroupe les **skills attachées au Managed Agent Inigo** (au sens
[Managed Agents Skills](https://platform.claude.com/docs/en/managed-agents/skills)). À ne pas
confondre avec les skills de `/.claude/skills/`, qui sont consommées par Claude Code en local
pour le développement de ce repo.

- **`intervals-icu-workouts`** : apprend à l'agent la syntaxe du workout builder Intervals.icu.
  Le texte rédigé va dans le champ `description` du tool MCP `create_or_update_event`
  (`apps/intervals-icu-mcp`), avec un `type` (Ride/Run/Swim) cohérent avec la cible.

Chaque skill est un dossier `SKILL.md` (+ `reference/`). Le cycle upload/attach est **manuel**
(comme la session, le MCP et le vault) car l'agent est créé hors-repo :

```bash
# 1) zipper la skill
(cd apps/coach/agent-skills && zip -r intervals-icu-workouts.zip intervals-icu-workouts)

# 2) créer la skill → renvoie un skill_* id
curl -X POST "https://api.anthropic.com/v1/skills" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02" \
  -F "files[]=@apps/coach/agent-skills/intervals-icu-workouts.zip"
```

Puis attacher `{"type":"custom","skill_id":"skill_…","version":"latest"}` au tableau `skills`
de l'agent (max 20 skills/session). Re-zipper + re-`POST` publie une nouvelle version.

## Tests

- Vitest co-localisés (`*.spec.ts`). `pnpm --filter @inigo/coach run test`.
- Couvre : config, auth (HMAC), parsing/normalisation du payload, **mapper** (payload →
  append correct + filtres), brain (fake SDK). Pas de réseau (fakes injectés).
- `pnpm verify` (racine) doit être vert avant tout commit.
