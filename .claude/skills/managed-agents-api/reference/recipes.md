# Managed Agents — recettes copiables

Prérequis : `export ANTHROPIC_API_KEY=…` (workspace du brain). CLI : `brew install anthropics/tap/ant`.
Préférer les scripts `@inigo/brain` (lecture par défaut, écritures gated) ; `ant`/SDK pour l'ad-hoc.

## Lire l'archi (ad-hoc)

```bash
ant beta:agents list                              # tous les agents du workspace
ant beta:agents retrieve --agent-id agent_XXX     # config complète (system, tools, mcp, skills)
ant beta:agents:versions list --agent-id agent_XXX
ant beta:vaults list
ant beta:memory-stores list
ant beta:skills list --source custom
```

Snapshot complet + versionné (recommandé) :
```bash
pnpm --filter @inigo/brain run brain:pull          # -> tooling/brain/snapshot/*.json
```

## Mettre à jour un agent (nouvelle version, 409-safe)

1. `brain:pull` → éditer `tooling/brain/snapshot/agents/<id>.json` (system, tools, mcp_servers, skills…).
2. Dry-run puis apply :
```bash
pnpm --filter @inigo/brain run brain:agent:apply agent_XXX            # dry-run : champs modifiés
pnpm --filter @inigo/brain run brain:agent:apply agent_XXX --apply    # crée la nouvelle version
```
Ad-hoc équivalent (nécessite la version courante) :
```bash
ant beta:agents update --agent-id agent_XXX --version 3 <<'YAML'
system: |
  Nouveau system prompt…
YAML
```

## Ajouter une env var / secret au vault

```bash
export MY_SECRET=…    # ne jamais mettre le secret en clair dans la commande
pnpm --filter @inigo/brain run brain:vault:cred:add \
  --vault=vlt_XXX --name=INTERVALS_API_KEY --value-env=MY_SECRET \
  --hosts=api.intervals.icu --display="Intervals key" --apply
```
Rappel : `allowed_hosts` doit aussi être autorisé au niveau de l'environnement.

## Auditer / structurer la mémoire

```bash
pnpm --filter @inigo/brain run brain:memory:audit           # dump complet -> tooling/brain/memory/
ant beta:memory-stores list
ant beta:memory-stores:memories list --memory-store-id memstore_XXX --path-prefix / --order-by path
ant beta:memory-stores:memories retrieve --memory-store-id memstore_XXX --memory-id mem_XXX
```
Seed/édition (SDK) :
```ts
await client.beta.memoryStores.memories.create(storeId, { path: "/prefs/format.md", content: "…" });
await client.beta.memoryStores.memories.update(memId, { memory_store_id: storeId, content: "…",
  preconditions: [{ type: "content_sha256", content_sha256: sha }] });   // évite d'écraser l'agent
```

## Déployer un skill d'agent

```bash
pnpm --filter @inigo/brain run brain:skill:deploy intervals-icu-workouts            # dry-run
pnpm --filter @inigo/brain run brain:skill:deploy intervals-icu-workouts --apply    # crée/verse une version
pnpm --filter @inigo/brain run brain:skill:deploy intervals-icu-workouts --apply --attach --agent=agent_XXX
```
Ad-hoc :
```bash
ant beta:skills create --file tooling/agent-skills/intervals-icu-workouts/SKILL.md --beta skills-2025-10-02
```

## Créer une session de test + envoyer un message

```bash
ant beta:sessions create --agent agent_XXX --environment-id env_XXX --vault-id vlt_XXX
ant beta:sessions:events send --session-id sesn_XXX <<'YAML'
events:
  - type: user.message
    content:
      - type: text
        text: "Salut, résume ma dernière séance."
YAML
```
SDK (le pattern que coach utilise déjà) :
```ts
await client.beta.sessions.events.send(sessionId, {
  events: [{ type: "user.message", content: [{ type: "text", text }] }]
});
```
