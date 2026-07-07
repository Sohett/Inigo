# @inigo/brain — guide agents

Outillage dev local pour opérer le brain (Claude Managed Agents). Complète l'`AGENTS.md` racine.

> **Avant de toucher un endpoint Managed Agents**, consulte le skill Claude Code
> `managed-agents-api` (`.claude/skills/managed-agents-api/`) : modèle objet, tables
> REST/`ant`/SDK, recettes, gotchas. Ne devine jamais la forme d'un endpoint.

## Rôle

- **Pas un service déployé.** Ce package ne ship pas ; il sert uniquement au dev local (et
  éventuellement à de la CI d'ops). Il vit sous `tooling/`, hors `apps/`.
- Enveloppe fine autour de `@anthropic-ai/sdk` (surface `client.beta.*`). Le SDK pose les headers
  beta (`managed-agents-2026-04-01`, `skills-2025-10-02`) automatiquement.

## Architecture

- `src/config.ts` : schéma zod de l'env (clé requise, jamais loggée).
- `src/client.ts` : factory `Anthropic` (option `maxRetries` pour les tests).
- `src/lib/*.ts` : logique pure et testable (injecte le client) — `snapshot`, `memoryAudit`,
  `deploySkill`, `applyAgent`, `vaultCred`, `writeGuard`, `args`, `util`.
- `src/bin/*.ts` : entrypoints CLI (parse argv, appellent les libs, impriment le plan/résultat).

## Règles

- **Lecture par défaut, écritures gated.** Toute opération mutante passe par `ensureApply` : dry-run
  sans `--apply`, écriture réelle avec `--apply`. Ne jamais contourner ce garde-fou.
- **Jamais de secret loggé.** Les plans masquent les valeurs (`secret_value: "***"`). Lire les
  secrets via `--value-env=<ENV>` plutôt qu'en clair sur la ligne de commande.
- **Concurrence optimiste** : les updates d'agent envoient la version courante ; un 409 devient une
  `AgentVersionConflictError` (« re-pull »).
- **Résilience de lecture** : `snapshot`/`memoryAudit` capturent les erreurs par ressource
  (`errors[]`) et les affichent, plutôt que d'avorter — jamais de silence.
- **TS strict, pas de `any`.** Imports relatifs sans extension. zod sur l'env.

## Tests

- Vitest + msw co-localisés (`src/**/*.spec.ts`). Les libs sont testées en injectant un client
  pointé sur `https://api.anthropic.com` (intercepté par msw), avec `maxRetries: 0`.
- Les `bin/` sont exclus de la couverture (fine glue). `pnpm verify` doit passer avant commit.

## Sorties

- `snapshot/` : miroir git-tracké de l'archi (à commiter volontairement).
- `memory/` : dumps mémoire, **gitignore** (données perso athlète).
