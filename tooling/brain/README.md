# @inigo/brain

Outillage de **dev local** pour opérer le brain d'Inigo (le Claude Managed Agent) sans passer par
la console web : lire l'architecture, auditer la mémoire, déployer des skills, mettre à jour des
versions d'agent et ajouter des secrets au vault.

Posture : **lecture par défaut, écritures gated**. Les commandes qui touchent le brain en prod
tournent en dry-run et n'écrivent qu'avec `--apply`. Aucun secret n'est loggé.

## Prérequis

- `ANTHROPIC_API_KEY` du **workspace du brain** (cf. `.env.example`). La mettre dans
  `tooling/brain/.env` ou l'exporter dans le shell.
- Optionnel : `BRAIN_AGENT_ID` pour cibler un agent par défaut.
- Optionnel (ad-hoc) : la CLI officielle `ant` → `brew install anthropics/tap/ant`.

## Commandes

```bash
# Lecture
pnpm --filter @inigo/brain run brain:pull            # snapshot de l'archi -> snapshot/*.json (versionné)
pnpm --filter @inigo/brain run brain:memory:audit    # dump mémoire -> memory/ (gitignore : données perso)

# Écritures (dry-run sans --apply)
pnpm --filter @inigo/brain run brain:skill:deploy <nom> [--apply] [--attach --agent=<id>]
pnpm --filter @inigo/brain run brain:agent:apply <agent_id> [--file=<path>] [--apply]
pnpm --filter @inigo/brain run brain:vault:cred:add --vault=<id> --name=<VAR> \
  (--value-env=<ENV> | --value=<literal>) --hosts=h1,h2 [--display=<label>] [--apply]
```

## Workflows

- **Comprendre / versionner l'archi** : `brain:pull`, puis commiter `snapshot/` (config d'agent,
  versions, environments, vaults, memory stores, skills). Le `system` prompt de l'agent y figure
  (privé, non secret) ; `snapshot/sessions.json` ne contient que des métadonnées.
- **Mettre à jour un agent** : `brain:pull` → éditer `snapshot/agents/<id>.json` → `brain:agent:apply
  <id> --apply` (nouvelle version, protégé contre les conflits de version 409).
- **Déployer un skill** : éditer `tooling/agent-skills/<nom>/` → `brain:skill:deploy <nom> --apply`.
- **Auditer la mémoire** : `brain:memory:audit` → lire `memory/` → produire des recommandations.

Détails d'API (endpoints, `ant`, SDK) : skill `managed-agents-api` (`.claude/skills/`).

## Dev

`pnpm --filter @inigo/brain run test | typecheck | lint`. Tests Vitest + msw co-localisés
(`src/**/*.spec.ts`). Les scripts tournent via `tsx`.
