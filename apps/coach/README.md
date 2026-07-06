# coach

Backend d'Inigo (Next.js, full-stack, sur Vercel). Aujourd'hui il expose **un webhook**
qui **mappe** les messages WhatsApp entrants (depuis une gateway **OpenWA** auto-hébergée)
vers une **session de Managed Agent Anthropic**. L'agent répond ensuite **lui-même** sur
WhatsApp via son outil MCP OpenWA (`MessageSendText`).

À terme, cette même app hébergera l'**admin** (dashboards, actions, triggers sur le brain).

> WhatsApp non-officiel, par choix : on garde toute la flexibilité de WhatsApp classique.
> L'API Cloud officielle de Meta n'est volontairement pas utilisée.

## Flux (MVP, single-user)

```
WhatsApp (Thomas)
   ⇅
OpenWA (Railway) — webhook message.received (filtre Sender=Thomas) ──►  coach
                 ◄── MCP /mcp : l'agent appelle MessageSendText (la réponse) ── Managed Agent
   ⇅
coach (Vercel)
   POST /api/webhooks/whatsapp → whatsappToAnthropicManagedAgentsMapper → append user.message à la session fixe
   ⇅
Managed Agent (Anthropic) — session fixe = mémoire ; MCP: intervals-icu-mcp + OpenWA ; répond via MessageSendText
```

Le mapper extrait `body` + `chatId`, formate `chat_id: …\nmessage: …`, et **append** à la
session. L'agent tourne côté Anthropic (les tools MCP s'exécutent server-side via le vault),
donc **rien ici n'a besoin d'écouter la réponse** ni d'envoyer le message.

## Variables d'environnement

Validées au boot par `src/config/config.ts`. Copie `.env.example` → `.env` **dans ce dossier**.

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic (server-side) |
| `ANTHROPIC_SESSION_ID` | Session Managed **fixe** où append les messages (mémoire de la conversation) |
| `WHATSAPP_WEBHOOK_SECRET` | Optionnel — vérif HMAC `X-OpenWA-Signature` si renseigné |

## Setup (résumé)

1. **Gateway OpenWA sur Railway** — voir [`docs/railway-cookbook.md`](docs/railway-cookbook.md).
2. **Session Managed fixe** (contrôle Anthropic, `ant` CLI / console), créée une fois avec
   ton agent coach + un **vault `static_bearer`** pour le MCP OpenWA (`url=<gateway>/mcp`,
   `token=` clé OPERATOR). Son id → `ANTHROPIC_SESSION_ID`.
   > Les *deployments* Managed servent uniquement aux runs planifiés (cron) ; ici on n'en utilise pas : le coach pousse les messages à une session existante via l'API (`POST /v1/sessions/:id/events`).
3. **Prompt système de l'agent** : « tu reçois des messages WhatsApp au format
   `chat_id: …\nmessage: …` ; réponds en appelant `MessageSendText(sessionId="<UUID session
   OpenWA>", chatId=<le chat_id fourni>, text=…)` ; concis, adapté à WhatsApp ».
4. **Webhook OpenWA** → URL `https://<coach>/api/webhooks/whatsapp`, event
   `message.received`, filtre `Sender is Thomas`.

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

Architecture interne, conventions, structure en couches, contrat de mapping et tests :
voir [`AGENTS.md`](AGENTS.md).
