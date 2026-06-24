# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

La **source de vérité** des conventions, commandes et de l'architecture est `AGENTS.md`
(standard ouvert, partagé par tous les outils). Ce fichier l'importe et n'ajoute que ce qui
est spécifique à Claude Code.

@AGENTS.md

## Commits

- **Jamais de `Co-Authored-By`** dans les messages de commit — ni Claude, ni aucun outil.

## Spécifique à Claude Code

- **Skill `intervals-icu-api`** : avant d'ajouter, modifier ou vérifier un endpoint
  Intervals.icu, consulte ce skill (spec OpenAPI bundlée + recettes de requête). Ne devine
  jamais la forme d'un endpoint.
- **Doc d'un service** : quand tu travailles dans `apps/<service>/`, l'`AGENTS.md` de ce
  dossier (chargé automatiquement) complète celui-ci avec les détails du service.
