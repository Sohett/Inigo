# Cookbook — Déployer la gateway OpenWA sur Railway

But : faire tourner **OpenWA** (gateway WhatsApp non-officielle) en **process persistant**
sur Railway, exposer son **API REST** + son **MCP** + un **webhook** vers l'app
`coach` (sur Vercel). Suis les étapes dans l'ordre ; coche au fur et à mesure.

> Rappel d'archi : OpenWA **ne peut pas** vivre sur Vercel (process always-on + état de
> session sur disque). Railway héberge la gateway ; Vercel héberge `coach`. Voir le
> [`README.md`](../README.md) du service.

À la fin tu auras :
- une URL publique HTTPS `https://<ton-service>.up.railway.app`
- une session WhatsApp authentifiée (QR scanné une fois) qui **survit aux redeploys**
- `POST /mcp` joignable (pour le Managed Agent) et un webhook vers `coach`

---

## 0. Prérequis

- [ ] Un compte **Railway** en plan **Hobby** (5 $/mois ; le plan Free ne permet pas le
      « always-on » fiable).
- [ ] Un **numéro WhatsApp dédié** + le téléphone à portée de main pour scanner le QR.
      ⚠️ Approche non-officielle = risque de ban : numéro dédié, volume bas, pas de spam.
- [ ] (Optionnel) le **Railway CLI** : `npm i -g @railway/cli` puis `railway login`.
- [ ] L'URL de ton app Vercel `coach` (ex. `https://coach.inigo-coach.com`) —
      peut être renseignée plus tard ; tu enregistreras le webhook une fois l'app déployée.

Génère deux secrets tout de suite (garde-les) :
```bash
export OWA_MASTER_KEY="$(openssl rand -hex 32)"      # bootstrap admin OpenWA
export OWA_WEBHOOK_SECRET="$(openssl rand -hex 32)"  # HMAC du webhook -> glue
```

---

## 1. Déployer OpenWA

### Voie A — Template Railway (recommandé)
1. [ ] Ouvre le template OpenWA « lite » (sans Postgres/Redis) :
       <https://railway.com/deploy/openwa-lite-without-postgres-redis-and-m>
       (ou cherche « OpenWA » dans Railway → New → Template).
2. [ ] Déploie dans ton projet. Railway crée le service à partir de l'image OpenWA.

### Voie B — Image Docker (si tu n'utilises pas le template)
1. [ ] Railway → **New → Empty Service → Deploy from Docker Image**.
2. [ ] Image : `ghcr.io/rmyndharis/openwa:latest` (vérifie le tag exact dans les *packages*
       du repo GitHub). Image publique → pas besoin du plan Pro.

---

## 2. Réglages critiques

### 2a. Variables d'environnement
Service → **Variables** → ajoute (ou `railway variables --set 'KEY=value'`) :

| Variable | Valeur | Pourquoi |
|---|---|---|
| `BIND_HOST` | `0.0.0.0` | **CRITIQUE.** Défaut `127.0.0.1` → Railway ne peut pas router, tu auras des 502. |
| `API_PORT` | `2785` | Port HTTP d'OpenWA (doit matcher le port public, cf. 2d). |
| `MCP_ENABLED` | `true` | Monte `POST /mcp` (Streamable-HTTP) pour le Managed Agent. |
| `AUTO_START_SESSIONS` | `true` | **Important.** Reprend la session WhatsApp au redémarrage/redeploy. |
| `ENGINE_TYPE` | `whatsapp-web.js` | Défaut, le plus stable (Chromium). `baileys` = plus léger/moins cher (pas de Chromium). |
| `API_MASTER_KEY` | `$OWA_MASTER_KEY` | Credential admin de bootstrap (sert à créer les clés API scoped). |
| `DATABASE_TYPE` | `sqlite` | Défaut. Pas de Postgres pour démarrer (SQLite vit dans le volume). |
| `STORAGE_TYPE` | `local` | Défaut. Médias dans le volume. |

Laisse `MCP_READONLY` **non défini** (le coach doit pouvoir envoyer). `WEBHOOK_SSRF_PROTECT`
reste `true` (ta glue Vercel est publique, donc OK).

### 2b. Volume persistant
- [ ] Service → **Volumes → New Volume**, **Mount path = `/app/data`**.
      OpenWA range sous `./data/` : `sessions/`, `baileys/`, `media/` et la base SQLite.
      Sans volume, tout est perdu à chaque redeploy (et il faudrait re-scanner le QR).

### 2c. Désactiver « Serverless » (app-sleeping)
- [ ] Service → **Settings** → cherche **Serverless / App Sleeping** → **OFF**.
      **CRITIQUE.** Sinon le service s'endort après ~10 min d'inactivité, la socket WhatsApp
      tombe et tu rates les messages entrants.

### 2d. Domaine public + port
- [ ] Service → **Settings → Networking → Generate Domain**.
- [ ] **Target port = `2785`** (= `API_PORT`).
- [ ] Note l'URL : `https://<ton-service>.up.railway.app` → ce sera `OPENWA_BASE_URL`.

### 2e. Une seule instance
- [ ] Service → **Settings** → **Replicas = 1**.
      Ne **jamais** scaler horizontalement : chaque réplica tenterait de tenir la session
      WhatsApp → conflits d'auth.

Redéploie après ces réglages.

---

## 3. Créer une clé API

1. [ ] Ouvre le **dashboard OpenWA** à la racine du domaine public
       (`https://<ton-service>.up.railway.app`), connecte-toi avec `API_MASTER_KEY`.
2. [ ] Crée une **clé API dédiée, rôle OPERATOR** (non-admin), pour la glue + le MCP.
       Elle ressemble à `owa_k1_...`. Garde-la :
```bash
export OWA_API_KEY="owa_k1_xxx"
export OWA_URL="https://<ton-service>.up.railway.app"
```
> Si tu préfères 2 clés (une pour le REST glue, une scoped session pour le MCP), crée-les
> ici. C'est la bonne pratique « least privilege ».

---

## 4. Créer + authentifier la session WhatsApp

Le plus simple : **dans le dashboard**, crée une session (ex. nom `default`), lance-la, et
**scanne le QR** avec le téléphone du numéro dédié.

En CLI équivalent :
```bash
# Créer (name : 3-50 caractères, alphanum + tirets)
curl -X POST "$OWA_URL/api/sessions" \
  -H "Content-Type: application/json" -H "X-API-Key: $OWA_API_KEY" \
  -d '{"name":"default"}'

# Démarrer
curl -X POST "$OWA_URL/api/sessions/default/start" -H "X-API-Key: $OWA_API_KEY"

# Récupérer le QR (champ qrCode = data URL PNG ; ouvre-le et scanne avec le téléphone)
curl "$OWA_URL/api/sessions/default/qr" -H "X-API-Key: $OWA_API_KEY"
```
- [ ] Statut de session = `connected`/`authenticated`.
- [ ] `export OWA_SESSION_ID="default"`

**Test de persistance (à ne pas sauter)** : Railway → redeploy le service. Grâce au volume
+ `AUTO_START_SESSIONS=true`, la session doit revenir **sans re-scanner**. Si tu dois
re-scanner → vérifie le mount `/app/data` et `AUTO_START_SESSIONS`.

---

## 5. Vérifier le MCP

```bash
curl -X POST "$OWA_URL/mcp" \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $OWA_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
- [ ] La réponse liste ~39 tools (Session*/Message*/Contact*/Group*/Webhook*).
- [ ] L'outil d'envoi de texte est **`MessageSendText`** (confirmé). Il exige `sessionId`
      (UUID de session OpenWA) + `chatId` + `text` → tu l'utiliseras dans le **prompt système
      de l'agent** (c'est l'agent qui envoie la réponse via ce tool).

---

## 6. Enregistrer le webhook vers coach

> À faire une fois `coach` déployé sur Vercel (tu connais alors son URL). Le `secret`
> est **optionnel** en MVP ; si tu le mets, il doit être identique à `WHATSAPP_WEBHOOK_SECRET`
> côté app (clé HMAC vérifiée sur l'entête `X-OpenWA-Signature`). Tu peux aussi le faire
> depuis l'écran « Create Webhook » du dashboard OpenWA.

```bash
export COACH_URL="https://<coach>.vercel.app"   # ou ton domaine custom

curl -X POST "$OWA_URL/api/sessions/$OWA_SESSION_ID/webhooks" \
  -H "Content-Type: application/json" -H "X-API-Key: $OWA_API_KEY" \
  -d "{
    \"url\": \"$COACH_URL/api/webhooks/whatsapp\",
    \"events\": [\"message.received\"],
    \"secret\": \"$OWA_WEBHOOK_SECRET\"
  }"

# Vérifier
curl "$OWA_URL/api/sessions/$OWA_SESSION_ID/webhooks" -H "X-API-Key: $OWA_API_KEY"
```

---

## 7. Câbler les variables

### Côté app (Vercel — `apps/coach`)
```
ANTHROPIC_API_KEY        = sk-ant-…
DATABASE_URL             = postgresql://…@…neon.tech/…?sslmode=require
DB_ENCRYPTION_KEY        = <clé base64 32 octets>
WHATSAPP_WEBHOOK_SECRET  = $OWA_WEBHOOK_SECRET   # optionnel
```
(le routing est fire-and-forget : l'agent envoie la réponse via son MCP OpenWA → pas de
variable OpenWA côté app. Plus de session fixe en env : la session est résolue par
`phone_num` dans Neon.)

### Côté Managed Agent (contrôle Anthropic, une fois)
- **Vault `static_bearer`** pour le MCP OpenWA : **URL = `$OWA_URL/mcp`**, **token = `$OWA_API_KEY`**.
- **Session par athlète** créée avec l'agent coach + ce vault (+ celui d'intervals-icu-mcp) →
  son id stocké en base dans `athlete.anthropic_session_id` (avec le `phone_num`).
- **Prompt système** : reçoit `chat_id: …\nmessage: …` → répond via
  `MessageSendText(sessionId="<UUID session OpenWA>", chatId=<fourni>, text=…)`.

---

## 8. Vérification bout-en-bout
1. [ ] Envoie un message WhatsApp au numéro dédié depuis un autre téléphone.
2. [ ] Logs Railway (OpenWA) : livraison du webhook.
3. [ ] Logs Vercel (coach) : `forwarded athlete=… session=… chat=…` (ou `ignored delivery: <raison>`).
4. [ ] Tu reçois la réponse du coach sur WhatsApp. 🎉

---

## 9. Coût (ordre de grandeur)
- Hobby = **5 $/mois** minimum (crédit inclus).
- Service OpenWA seul : ~**5–10 $/mois** (RAM : `whatsapp-web.js`/Chromium ~512 Mo–1 Go ;
  `baileys` ~200–300 Mo → moins cher). SQLite dans le volume → **pas de Postgres** pour v1.
- Volume : ~0,15 $/Go/mois.

---

## 10. Dépannage

| Symptôme | Cause probable | Fix |
|---|---|---|
| 502 / domaine ne répond pas | `BIND_HOST` resté `127.0.0.1`, ou target port ≠ `API_PORT` | `BIND_HOST=0.0.0.0`, target port = `2785` |
| Session perdue après redeploy | pas de volume, ou `AUTO_START_SESSIONS=false`, ou Serverless ON | volume `/app/data`, `AUTO_START_SESSIONS=true`, Serverless OFF |
| QR à re-scanner tout le temps | volume non monté sur `/app/data` | corriger le mount path |
| Webhook ne part pas | mauvais `events`, `secret` divergent, ou URL injoignable | `events:["message.received"]`, même secret des 2 côtés, URL glue publique |
| Glue répond 401 | `OPENWA_WEBHOOK_SECRET` ≠ `secret` du webhook | aligner les deux |
| `tools/list` 401 | mauvais header d'auth | `Authorization: Bearer $OWA_API_KEY` (ou `X-API-Key`) |
| Numéro banni | volume/pattern trop agressif | numéro dédié, volume bas, pas d'envoi en masse |

---

## Checklist finale
- [ ] `BIND_HOST=0.0.0.0`, `API_PORT=2785`, target port 2785, domaine généré
- [ ] `MCP_ENABLED=true`, `AUTO_START_SESSIONS=true`, `ENGINE_TYPE` choisi
- [ ] Volume monté sur `/app/data`
- [ ] Serverless **OFF**, Replicas **= 1**
- [ ] Clé API OPERATOR créée
- [ ] Session WhatsApp authentifiée + **persistance vérifiée après redeploy**
- [ ] `tools/list` OK + nom de l'outil d'envoi noté
- [ ] Webhook enregistré vers la glue (même secret)
- [ ] Variables câblées (Vercel + vault OpenWA)
- [ ] Test bout-en-bout réussi
