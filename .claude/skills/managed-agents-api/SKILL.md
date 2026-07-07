---
name: managed-agents-api
description: Référence pour opérer le brain d'Inigo (Claude Managed Agents) depuis le dev local — lire/mettre à jour l'archi d'un agent, gérer versions/sessions/environnements, vaults & credentials (env vars), memory stores, et skills. À consulter AVANT de toucher un endpoint Managed Agents, d'écrire un script contre le SDK `@anthropic-ai/sdk` (surface `beta.*`), d'auditer/structurer la mémoire, ou de déployer un skill d'agent. Ne devine jamais la forme d'un endpoint : vérifie ici.
---

# Managed Agents (le « brain ») — référence d'opérations

Le brain est un **Claude Managed Agent** hébergé chez Anthropic. On l'opère depuis le
dev local de trois façons (par ordre de préférence) :

1. **Scripts `@inigo/brain`** (`tooling/brain/`) — pour les workflows répétables et sûrs.
   Lecture par défaut ; toute écriture exige `--apply`.
   ```bash
   pnpm --filter @inigo/brain run brain:pull            # snapshot de l'archi -> tooling/brain/snapshot/
   pnpm --filter @inigo/brain run brain:memory:audit    # dump mémoire -> tooling/brain/memory/ (gitignore)
   pnpm --filter @inigo/brain run brain:skill:deploy <nom> [--apply] [--attach --agent=<id>]
   pnpm --filter @inigo/brain run brain:agent:apply <agent_id> [--apply]   # pousse snapshot/agents/<id>.json en nouvelle version
   pnpm --filter @inigo/brain run brain:vault:cred:add --vault=<id> --name=<VAR> --value-env=<ENV> --hosts=h1,h2 [--apply]
   ```
2. **CLI `ant`** — pour l'ad-hoc (lecture, inspection). `brew install anthropics/tap/ant`.
   Toutes les commandes sont sous `ant beta:*`. Voir `reference/recipes.md`.
3. **SDK TypeScript** `@anthropic-ai/sdk` (déjà dépendance) — surface `client.beta.*`. Le SDK
   pose automatiquement les headers beta. Voir `reference/endpoints.md`.

**Toujours vérifier la forme exacte d'un endpoint dans `reference/endpoints.md`** (tables REST +
`ant` + SDK) et les snippets prêts à copier dans `reference/recipes.md`. Ne devine pas.

## Modèle objet (à connaître)

- **Agent** : config réutilisable + **versionnée** (`agent_…`) : `model`, `system`, `tools`,
  `mcp_servers`, `skills`, `description`, `metadata`.
- **Version d'agent** : chaque `update` qui change la config crée une **nouvelle version**
  (entier auto-incrémenté). Les sessions prennent `latest` par défaut, ou une version épinglée.
- **Environment** (`env…`) : sandbox où tournent les sessions (`cloud` ou `self_hosted`) —
  `packages`, `networking`. **Non versionné.**
- **Session** (`ses…`/`sesn_…`) : instance qui tourne (historique + filesystem serveur).
  Démarrage en **2 temps** : créer, puis envoyer un event `user.message`.
- **Deployment** (`depl_…`) : **planificateur cron** qui démarre des sessions. Ce n'est PAS
  « déployer une version d'agent ».
- **Vault** (`vlt_…`) + **credential** (`vcrd_…`) : magasin de secrets. Un credential
  `environment_variable` = « ajouter une env var au vault ». Attaché par session via `vault_ids`.
- **Memory store** (`memstore_…`) : mémoire persistante montée dans la session sous
  `/mnt/memory/<slug>/`. Versions immuables (`memver_…`). Attaché à la **création de session**.
- **Skill** (`skill_…`) : expertise procédurale versionnée, attachée à la **création de l'agent**.

## Auth & headers

- `ANTHROPIC_API_KEY` du **workspace du brain** (console → `/settings/keys`). Même workspace
  que l'agent coach. Jamais commitée, jamais loggée.
- Base URL `https://api.anthropic.com`. Sur du REST brut : `x-api-key`, `anthropic-version: 2023-06-01`,
  `anthropic-beta: managed-agents-2026-04-01` (le SDK et `ant` le posent seuls ; skills : `skills-2025-10-02`).

## Gotchas d'or (ne pas réapprendre à la dure)

- **« Déployer une version » n'est pas un endpoint.** `POST /v1/agents/{id}` (update) crée une
  nouvelle version. Pour rouler dessus : sessions en `latest`, ou version épinglée.
- **Concurrence optimiste** : l'update d'agent exige le champ `version` = version courante,
  sinon **409**. (Le script `brain:agent:apply` gère le 409 → « re-pull ».)
- **Champs tableau remplacés en entier** à l'update (`tools`, `mcp_servers`, `skills`) ; `metadata`
  fusionne par clé (`null` supprime une clé).
- **Env var = credential vault `environment_variable`** : le secret n'est jamais en clair dans la
  sandbox ; il est **substitué à l'egress** uniquement pour les `allowed_hosts` (≤16, hostnames nus,
  pas d'URL/port). Max **20 credentials/vault**. `secret_name` immuable. Pas sur self-hosted.
  Le `networking` de l'environnement doit AUSSI autoriser l'hôte (les deux couches).
- **Session** : `model`/`system`/`skills` ne se changent pas sur une session en cours — overrides
  à la création. Seuls `tools`/`mcp_servers` sont modifiables (session idle).
- **Stream** d'events : `GET /v1/sessions/{id}/events/stream` (le SDK : `sessions.events.stream`).
- Les valeurs de secret ne sont **jamais** renvoyées par l'API (audit-safe).

## Mémoire — quand et comment

- Un memory store est un petit **filesystem de documents texte** adressés par chemin
  (`/prefs/formatting.md`). Chaque changement crée une version immuable.
- **Auditer toute la mémoire** : `brain:memory:audit` (liste les stores, récupère le contenu
  complet de chaque mémoire → fichiers). Recette API/CLI dans `reference/recipes.md`.
- Bonnes pratiques (doc Anthropic) : **beaucoup de petits fichiers ciblés** plutôt que quelques
  gros ; **stores par périmètre** (un par user, un partagé en lecture seule, un par projet) ;
  élaguer avant de saturer (2 000 mémoires/store) ; `read_only` pour le matériel de référence.

## Skill vs Mémoire (règle de décision)

- **Skill** = expertise **procédurale stable, versionnée, que TU écris** (workflows, conventions,
  scripts, référence). Author-controlled, read-only pour l'agent au runtime, attachée à la
  création de l'agent, versionnée via l'API Skills. → *éditable en git puis redéployé.*
- **Mémoire** = **état évolutif, spécifique** (préférences user, faits projet, erreurs passées,
  contexte appris) que **l'agent lui-même** lit/écrit entre sessions. → *l'agent l'enregistre et
  la met à jour.*
- Heuristique : tu l'édites dans le repo et redéploies → **Skill**. L'agent doit l'accumuler au
  fil de l'eau, par user/projet → **Mémoire**. Les deux coexistent (montés dans le filesystem).
- Format d'un skill d'agent : dossier `SKILL.md` (frontmatter `name` + `description` en 3e
  personne, « ce que ça fait + quand l'utiliser ») + fichiers de référence à **un seul niveau**.
  Voir le skill existant `tooling/agent-skills/intervals-icu-workouts/` comme moule.

## Quand tu modifies le brain

- **Lecture d'abord** : `brain:pull` pour comprendre l'archi, `brain:memory:audit` pour la mémoire.
- **Écritures gated** : les scripts sont en dry-run sans `--apply`. Confirme le plan, puis `--apply`.
- **Un skill** : édite `tooling/agent-skills/<nom>/`, puis `brain:skill:deploy <nom> --apply`
  (nouvelle version ; `--attach --agent=<id>` pour l'épingler à l'agent).
- **La config d'un agent** : édite `tooling/brain/snapshot/agents/<id>.json` puis
  `brain:agent:apply <id> --apply` (nouvelle version, 409-safe).
- Après coup, re-`brain:pull` pour resynchroniser le snapshot git.
