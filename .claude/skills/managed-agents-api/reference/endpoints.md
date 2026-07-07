# Managed Agents — endpoints (REST · `ant` · SDK TS)

Base URL `https://api.anthropic.com`. Beta `managed-agents-2026-04-01` (skills : `skills-2025-10-02`).
SDK : `client.beta.<resource>` (headers auto). CLI : `ant beta:<resource> <verb>`.
Docs : https://platform.claude.com/docs/en/managed-agents/overview

## Agents (archi, update, versions)

| But | REST | `ant` | SDK TS |
|---|---|---|---|
| Créer | `POST /v1/agents` | `ant beta:agents create` | `client.beta.agents.create({...})` |
| Lire | `GET /v1/agents/{id}` | `ant beta:agents retrieve --agent-id` | `client.beta.agents.retrieve(id)` |
| Lister | `GET /v1/agents` | `ant beta:agents list` | `client.beta.agents.list()` |
| Update → nouvelle version | `POST /v1/agents/{id}` | `ant beta:agents update --agent-id --version` | `client.beta.agents.update(id, { version, ... })` |
| Lister versions | `GET /v1/agents/{id}/versions` | `ant beta:agents:versions list --agent-id` | `client.beta.agents.versions.list(id)` |
| Archiver | `POST /v1/agents/{id}/archive` | `ant beta:agents archive --agent-id` | `client.beta.agents.archive(id)` |

Update : `version` **requis** = version courante (sinon 409). Champs omis conservés ; scalaires
remplacés ; tableaux (`tools`/`mcp_servers`/`skills`) remplacés en entier (`[]`/`null` = vide) ;
`metadata` fusionne par clé. Un no-op ne crée pas de version.

Champs config : `name`, `model` (string ou `{id, speed}`), `system`, `tools`
(ex. `{"type":"agent_toolset_20260401"}`, `{"type":"mcp_toolset","mcp_server_name":"…"}`),
`mcp_servers` (`{"type":"url","name":"…","url":"…"}`), `skills`, `multiagent`, `description`, `metadata`.

## Environments

| But | REST | SDK |
|---|---|---|
| Créer / Lire / Lister | `POST /v1/environments` · `GET /v1/environments/{id}` · `GET /v1/environments` | `client.beta.environments.{create,retrieve,list}` |
| Archiver / Supprimer | `POST /v1/environments/{id}/archive` · `DELETE /v1/environments/{id}` | `client.beta.environments.{archive,delete}` |

Contenu : `type` (`cloud`/`self_hosted`), `packages` (apt/npm/pip/…), `networking`. Pas de champ
env var en clair : les secrets passent par le **vault**.

## Sessions

| But | REST | SDK |
|---|---|---|
| Créer | `POST /v1/sessions` | `client.beta.sessions.create({ agent, environment_id, vault_ids?, resources? })` |
| Lire / Lister | `GET /v1/sessions/{id}` · `GET /v1/sessions` (filtre `agent_id`) | `client.beta.sessions.{retrieve,list}` |
| Update (tools/mcp, idle) | `POST /v1/sessions/{id}` | `client.beta.sessions.update(id, { agent: {...} })` |
| Archiver / Supprimer | `POST /v1/sessions/{id}/archive` · `DELETE /v1/sessions/{id}` | `client.beta.sessions.{archive,delete}` |

Statuts : `idle`, `running`, `rescheduling`, `terminated`. `model`/`system`/`skills` → overrides
à la création uniquement.

### Events / streaming

| But | REST | SDK |
|---|---|---|
| Envoyer event(s) (démarrer avec `user.message`) | `POST /v1/sessions/{id}/events` | `client.beta.sessions.events.send(id, { events: [...] })` |
| Stream SSE | `GET /v1/sessions/{id}/events/stream` | `client.beta.sessions.events.stream(id)` |
| Lister events persistés | `GET /v1/sessions/{id}/events` | `client.beta.sessions.events.list(id)` |
| Interrompre / réorienter | `POST …/events` avec `{"type":"user.interrupt"}` (+ `user.message`) | idem `.send` |

Démarrer : `{"type":"user.message","content":[{"type":"text","text":"…"}]}`. Deltas token :
param `event_deltas[]` (`agent.message`, `agent.thinking`), jamais persistés.

## Vaults + credentials (env vars / secrets)

| But | REST | SDK |
|---|---|---|
| Créer / Lister vault | `POST /v1/vaults` · `GET /v1/vaults` | `client.beta.vaults.{create,list}` |
| Archiver / Supprimer vault | `POST /v1/vaults/{id}/archive` · `DELETE /v1/vaults/{id}` | `client.beta.vaults.{archive,delete}` |
| Ajouter credential | `POST /v1/vaults/{id}/credentials` | `client.beta.vaults.credentials.create(vaultId, {...})` |
| Update/rotate credential | `POST /v1/vaults/{id}/credentials/{cid}` | `client.beta.vaults.credentials.update(cid, { vault_id, ... })` |
| Lister / Archiver credential | `GET …/credentials` · `POST …/{cid}/archive` | `client.beta.vaults.credentials.{list,archive}` |
| Utiliser en session | `vault_ids: ["vlt_…"]` à la création | idem |

**Env var** = credential `auth.type: "environment_variable"` :
```json
{ "display_name": "Intervals key",
  "auth": { "type": "environment_variable", "secret_name": "INTERVALS_API_KEY",
    "secret_value": "…", "networking": { "type": "limited", "allowed_hosts": ["api.intervals.icu"] } } }
```
Substitué à l'egress pour `allowed_hosts` (≤16). Max 20 creds/vault. `secret_name` immuable.
Autres types : `mcp_oauth`, `static_bearer` (clés par `mcp_server_url`).

## Deployments (cron) — non utilisé par coach

`POST /v1/deployments` (+ `pause`/`unpause`/`archive`/`run`), `GET /v1/deployment_runs?deployment_id=…`.
SDK `client.beta.deployments.*` / `client.beta.deploymentRuns.list(...)`. Corps : `name`, `agent`,
`environment_id`, `initial_events` (dont `user.message`), `schedule: {type:"cron", expression, timezone}`.

## Memory stores

| But | REST | SDK |
|---|---|---|
| Créer / Lire / Lister / Update | `POST /v1/memory_stores` · `GET …/{id}` · `GET /v1/memory_stores` · `POST …/{id}` | `client.beta.memoryStores.{create,retrieve,list,update}` |
| Archiver / Supprimer | `POST …/{id}/archive` · `DELETE …/{id}` | `client.beta.memoryStores.{archive,delete}` |
| Lister mémoires | `GET /v1/memory_stores/{sid}/memories` (`path_prefix`, `order_by`, `depth`) | `client.beta.memoryStores.memories.list(sid, {...})` |
| Lire une mémoire | `GET …/memories/{mid}` | `client.beta.memoryStores.memories.retrieve(mid, { memory_store_id })` |
| Créer / Update / Supprimer mémoire | `POST …/memories` · `POST …/memories/{mid}` · `DELETE …/memories/{mid}` | `client.beta.memoryStores.memories.{create,update,delete}` |
| Versions (audit) | `GET /v1/memory_stores/{sid}/memory_versions?memory_id=…` · `GET …/{vid}` · `POST …/{vid}/redact` | `client.beta.memoryStores.memoryVersions.{list,retrieve}` |

Mémoire : `id` (`mem_…`), `path` (clé, renommable), `content` (plein si `view=full`, `null` en
`basic`), `content_sha256`, `content_size_bytes`, `memory_version_id`. ≤100 kB/mémoire ;
≤2 000/store ; ≤8 stores/session. Précondition d'update : `{ "type":"content_sha256", "content_sha256":"…" }`.
Attache en session via `resources[]` : `{"type":"memory_store","memory_store_id":"…","access":"read_write|read_only","instructions":"…"}`.

## Skills

| But | REST | `ant` | SDK |
|---|---|---|---|
| Créer | `POST /v1/skills` (multipart `files[]`) | `ant beta:skills create --file … --beta skills-2025-10-02` | `client.beta.skills.create({ files, display_title })` |
| Nouvelle version | `POST /v1/skills/{id}/versions` | `ant beta:skills:versions create --skill-id --file` | `client.beta.skills.versions.create(id, { files })` |
| Lister / Lire | `GET /v1/skills` (`?source=custom`) · `GET /v1/skills/{id}` | `ant beta:skills list` / `retrieve` | `client.beta.skills.{list,retrieve}` |
| Lister versions | `GET /v1/skills/{id}/versions` | `ant beta:skills:versions list --skill-id` | `client.beta.skills.versions.list(id)` |
| Supprimer | versions d'abord `DELETE …/versions/{v}` puis `DELETE /v1/skills/{id}` | `ant beta:skills:versions delete` puis `ant beta:skills delete` | `client.beta.skills.{versions.delete,delete}` |

Attache à l'agent (à sa création/update) via `skills: [{type:"anthropic",skill_id:"xlsx"}, {type:"custom",skill_id:"skill_…",version:"latest"}]`.
Max 20 skills/session. `latest` = auto-pickup des nouvelles versions. Bundle ≤30 MB, `SKILL.md` à
la racine. Skills pré-bâtis : `pptx`, `xlsx`, `docx`, `pdf`.

## Gotchas transverses

- Deploy version ≠ endpoint (voir Agents). 409 sur update sans `version` courant.
- Env var = credential vault ; substitution egress ; `allowed_hosts` requis des DEUX côtés (env + cred).
- Stream : `/events/stream` (pas `/stream`).
- Pagination SDK : réponses `{ data: [...], next_page }` ; `for await (const x of client.beta.X.list())`.
