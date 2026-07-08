# coach

Backend d'Inigo (Next.js, full-stack, sur Vercel). Aujourd'hui il expose **un webhook**
qui **route** les messages WhatsApp entrants (depuis une gateway **OpenWA** auto-hébergée)
vers la **bonne session de Managed Agent Anthropic**, résolue par le **`phone_num`** de
l'athlète en base (Neon). L'agent répond ensuite **lui-même** sur WhatsApp via son outil
MCP OpenWA (`MessageSendText`).

À terme, cette même app hébergera l'**admin** (dashboards, actions, triggers sur le brain).

> WhatsApp non-officiel, par choix : on garde toute la flexibilité de WhatsApp classique.
> L'API Cloud officielle de Meta n'est volontairement pas utilisée.

## Flux (multi-athlète, routing par `phone_num`)

```
WhatsApp (athlète)
   ⇅
OpenWA (Railway) — webhook message.received ──►  coach
                 ◄── MCP /mcp : l'agent appelle MessageSendText (la réponse) ── Managed Agent
   ⇅
coach (Vercel)
   POST /api/webhooks/whatsapp → routeInboundMessage.execute
     → résout l'athlète + sa session via phone_num (Neon) → append user.message à SA session
   ⇅
Managed Agent (Anthropic) — session de l'athlète = mémoire ; MCP: intervals-icu-mcp + OpenWA ; répond via MessageSendText
```

Le use-case dérive le numéro de l'expéditeur depuis le JID WhatsApp, résout l'athlète en base,
formate `chat_id: …\nmessage: …`, et **append** à **sa** session. Un numéro inconnu, un athlète
sans session ou un sender illisible sont gérés explicitement (aucun forward, réponse 200).
L'agent tourne côté Anthropic (les tools MCP s'exécutent server-side via le vault), donc **rien
ici n'a besoin d'écouter la réponse** ni d'envoyer le message.

## Variables d'environnement

Validées au boot par `src/config/config.ts`. Copie `.env.example` → `.env` **dans ce dossier**.

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic (server-side) |
| `DATABASE_URL` | Connexion Neon (base coaching partagée via `@inigo/db`), server-side |
| `DB_ENCRYPTION_KEY` | Clé base64 32 octets (AES-256-GCM) pour sceller les secrets par athlète |
| `WHATSAPP_WEBHOOK_SECRET` | Optionnel : vérif HMAC `X-OpenWA-Signature` si renseigné |

## Setup (résumé)

1. **Gateway OpenWA sur Railway** — voir [`docs/railway-cookbook.md`](docs/railway-cookbook.md).
2. **Session Managed par athlète** (contrôle Anthropic, `ant` CLI / console), créée avec
   l'agent coach + un **vault `static_bearer`** pour le MCP OpenWA (`url=<gateway>/mcp`,
   `token=` clé OPERATOR). Son id est stocké en base dans `athlete.anthropic_session_id`
   (avec le `phone_num` de l'athlète) : c'est ce que le routing résout. La création de session
   par athlète (onboarding) est hors périmètre pour l'instant.
   > Les *deployments* Managed servent uniquement aux runs planifiés (cron) ; ici on n'en utilise pas : le coach pousse les messages à une session existante via l'API (`POST /v1/sessions/:id/events`).
3. **Prompt système de l'agent** : « tu reçois des messages WhatsApp au format
   `chat_id: …\nmessage: …` ; réponds en appelant `MessageSendText(sessionId="<UUID session
   OpenWA>", chatId=<le chat_id fourni>, text=…)` ; concis, adapté à WhatsApp ».
4. **Webhook OpenWA** → URL `https://<coach>/api/webhooks/whatsapp`, event
   `message.received`.

## Lancer en local

```bash
pnpm dev:coach     # next dev (depuis la racine)

# Tester le webhook (sans secret) :
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "content-type: application/json" \
  -d '{"chatId":"628@c.us","body":"salut coach","type":"text"}'
# -> {"ok":true} ; le message est append à la session (voir logs).
```

## Déploiement

Vercel (Next.js). Variables via le dashboard Vercel. Endpoint : `/api/webhooks/whatsapp`.

## Contribuer

Architecture interne, conventions, structure en couches, contrat de routing et tests :
voir [`AGENTS.md`](AGENTS.md).
