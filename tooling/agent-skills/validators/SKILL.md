---
name: validators
description: Gate déterministe qui valide une semaine d'entraînement proposée AVANT tout push sur Intervals.icu. Exécute `run.py` sur un fichier `proposed-week.json` et rend un verdict reproductible pass/fail (mêmes entrées → même verdict), avec les checks qui échouent et un conseil de correction. À utiliser dès qu'un agent a produit une semaine (`proposed-week.json`) et qu'il faut la valider avant de créer/modifier des séances : c'est du code exécuté, pas un jugement LLM. Ne jamais valider une semaine « à la main ».
---

# Gate validateur déterministe

Le **gate** du système : aucune séance n'atteint Intervals.icu sans passer ces checks. Ce
sont du **code, pas du jugement LLM** — mêmes entrées produisent le même verdict, reproductible
et testable. La validation manuelle « à l'œil » contre des seuils est **interdite** : elle
court-circuite la garantie du gate.

## Flux

1. Un agent producteur (constructeur-hebdo ou réadaptateur) écrit `proposed-week.json` dans le
   scratch éphémère de session (`/workspace/runtime/proposed-week.json`).
2. Le coordinateur **exécute** le validateur :
   ```
   python /workspace/skills/validators/run.py /workspace/runtime/proposed-week.json --out /workspace/runtime/validation-report.json
   ```
3. Le coordinateur lit `/workspace/runtime/validation-report.json` :
   - `verdict == "pass"` → on peut poursuivre (confirmation athlète puis push).
   - `verdict == "fail"` → renvoie `blocking_failures` + `advice` à l'agent pour révision
     (≤ 3 cycles), sans jamais écrire sur Intervals.icu.

`run.py` imprime aussi le rapport sur stdout et `PASS`/`FAIL` sur stderr ; code retour `0` si
pass, `1` si fail. Aucune dépendance externe (stdlib Python uniquement).

## Contrat d'entrée / sortie

La **référence complète** — schéma de `proposed-week.json`, schéma de `validation-report.json`,
et la liste détaillée des checks avec leurs seuils — vit à côté de ce fichier :

```
SPEC.md
```

Ouvre `SPEC.md` pour construire un `proposed-week.json` conforme ou pour interpréter un rapport.

## Les checks (résumé)

Huit checks déterministes, chacun bloquant en cas d'échec :

- `schema` — 7 jours, champs requis présents.
- `weekly_tss` — TSS hebdo total dans la fourchette de la phase.
- `ramp_rate` — progression de CTL sur la semaine ≤ plafond.
- `intensity_dist` — part de temps en Z4+ (≥100 % FTP) ≤ cible.
- `hard_day_spacing` — ≥ 48 h entre deux jours durs (sauf `intended_back_to_back`).
- `power_target_sanity` — cibles de puissance dans [30, 160] % FTP ; une séance VO2 contient
  au moins un bloc de travail ≥ 100 %.
- `fixed_slots` — créneaux fixes respectés (renfo du jeudi ; pas d'indoor en semaine de vacances).
- `health` — aucune séance interdite par l'état santé (ex. course alors que `run_paused`).

## Tests

`test_validators.py` couvre le gate de bout en bout (semaine valide → pass, semaine fautive →
fail sur les bons checks, sous-charge et ramp excessif rejetés). Lance-le après toute
modification de `run.py` ou des fixtures :

```
python /workspace/skills/validators/test_validators.py
```

Fixtures : `sample-week-good.json` (passe tous les checks) et `sample-week-bad.json` (viole
`ramp_rate`, `hard_day_spacing`, `health`).
