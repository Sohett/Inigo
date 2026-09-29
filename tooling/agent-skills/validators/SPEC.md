# Contrat du gate validateur

Référence du gate déterministe (`run.py`). Contrat d'entrée (`proposed-week.json`), contrat de
sortie (`validation-report.json`), et détail des huit checks avec leurs seuils. Ce document
remplace l'ancienne référence `01-INTERFACE-CONTRACT.md §5`.

## Entrée — `proposed-week.json`

```json
{
  "week": "2026-W27",
  "phase": "Build 1 — Base/SST",
  "generated_by": "constructeur-hebdo",
  "athlete_ref": { "ftp_w": 305, "ctl": 45.0, "atl": 48.0, "tsb": -3.0 },
  "phase_targets": {
    "weekly_tss": [430, 580],
    "max_z4plus_pct": 15,
    "ctl_weekly_ramp_max": 5.0
  },
  "health_flags": { "run_paused": true },
  "constraints": [
    { "id": "…", "kind": "fixed_session", "weekday": 2, "activity": "strength", "startTime": "07:00" },
    { "id": "…", "kind": "unavailable", "startDate": "2026-07-03", "endDate": "2026-07-03", "note": "déplacement" }
  ],
  "days": [
    {
      "date": "2026-06-30",
      "sport": "VirtualRide",
      "label": "VO2",
      "intensity": "vo2",
      "duration_min": 55,
      "tss": 85,
      "indoor": true,
      "blocks": [
        { "pct_ftp": 50, "minutes": 15 },
        { "pct_ftp": 110, "minutes": 20 },
        { "pct_ftp": 50, "minutes": 20 }
      ]
    }
  ]
}
```

### Champs

Racine :
- `week`, `phase`, `generated_by` — métadonnées (repris tels quels dans le rapport pour `week`).
- `athlete_ref.ctl` — **requis** : CTL de départ, utilisé par `ramp_rate`.
- `phase_targets` — **requis** : `weekly_tss` (`[lo, hi]`), `max_z4plus_pct` (nombre),
  `ctl_weekly_ramp_max` (nombre). Ce sont les seuils de la phase (issus de la Knowledge Base).
- `health_flags` — optionnel : `run_paused` (bool).
- `constraints` — **requis** : la liste `constraints` renvoyée par `get_profile`, **recopiée telle
  quelle** (liste vide `[]` si l'athlète n'en a aucune ; clé absente = `fixed_slots` en échec).
  Chaque contrainte est récurrente (`weekday`, ISO : 1 = lundi … 7 = dimanche) **ou** datée
  (`startDate`..`endDate` inclus), de `kind` :
  - `fixed_session` — le jour doit porter `activity` (`strength` : `intensity: strength`,
    `strength_present` ou `label` contenant « renfo » ; `bike` : sport `*Ride` ; `run` :
    `Run`/`TrailRun`/`VirtualRun` ; `swim` : `Swim`) ;
  - `unavailable` — le jour doit être au repos (`tss` 0, `blocks` vide, `duration_min` 0) ;
  - `limited` — non vérifiable par machine (lu par l'agent via `note`).

  Une contrainte datée `unavailable` ou `limited` suspend les créneaux fixes **récurrents** des
  jours qu'elle couvre ; un `fixed_session` daté est toujours exigé.
- `days` — **exactement 7 entrées**.

Par jour (`days[]`) :
- **Requis** : `date` (ISO `YYYY-MM-DD`), `sport`, `intensity`, `tss` (nombre), `blocks` (liste).
- `intensity` ∈ libre, mais les valeurs `vo2` / `threshold` / `anaerobic` marquent un **jour dur**
  (contrainte d'espacement). `strength` marque une séance de renfo.
- `blocks[]` : `{ "pct_ftp": <nombre>, "minutes": <nombre>, "cadence"?: <nombre> }`. Un bloc
  `pct_ftp >= 100` compte comme **Z4+** (distribution d'intensité).
- Optionnels influençant les checks :
  - `intended_back_to_back` (bool) — exempte le jour de la contrainte d'espacement.
  - `indoor` (bool) — interdit en semaine de vacances.
  - `is_vacation_block` (bool) — semaine de vacances (suspend les créneaux fixes, interdit l'indoor).
  - `strength_present` (bool) — atteste la présence de renfo sur le jour.
- `duration_min`, `label` — indicatifs (le gate raisonne sur `blocks` et `tss`).

## Sortie — `validation-report.json`

```json
{
  "verdict": "pass",
  "week": "2026-W27",
  "checks": [
    { "id": "weekly_tss", "status": "pass", "detail": "500 TSS dans [430,580]" }
  ],
  "blocking_failures": [],
  "advice": null
}
```

- `verdict` — `"pass"` si aucun check en échec, sinon `"fail"`.
- `checks[]` — un objet par check : `id`, `status` (`pass`/`fail`), `detail` (texte humain).
- `blocking_failures[]` — les `id` des checks en échec (vide si pass).
- `advice` — conseils de correction concaténés pour les checks échoués, `null` si pass.

Code retour du process : `0` si pass, `1` si fail, `2` si usage invalide. Un check qui lève une
exception est compté **fail** (jamais un faux pass).

## Les huit checks

| id | Règle | Seuil |
|---|---|---|
| `schema` | 7 jours ; chaque jour a `date`, `sport`, `intensity`, `tss`, `blocks` | structure |
| `weekly_tss` | Σ `tss` des 7 jours | dans `phase_targets.weekly_tss` `[lo, hi]` (sous-charge = fail) |
| `ramp_rate` | ΔCTL sur la semaine (CTL lissé sur 42 j à partir de `athlete_ref.ctl`) | ≤ `ctl_weekly_ramp_max` |
| `intensity_dist` | minutes Z4+ (`pct_ftp ≥ 100`) / minutes totales | ≤ `max_z4plus_pct` |
| `hard_day_spacing` | écart entre jours durs (`vo2`/`threshold`/`anaerobic`) | ≥ 48 h, sauf `intended_back_to_back` |
| `power_target_sanity` | chaque `pct_ftp` dans `[30, 160]` ; une séance `vo2` a ≥ 1 bloc ≥ 100 % | bornes FTP |
| `fixed_slots` | lit `constraints` : chaque `fixed_session` a son activité sur son jour (un récurrent est suspendu par une contrainte datée non `fixed_session` ou `is_vacation_block`) ; jour `unavailable` = repos ; pas d'`indoor` si `is_vacation_block` ; `constraints` absent = fail | contraintes du profil |
| `health` | pas de `Run`/`TrailRun`/`VirtualRun` si `health_flags.run_paused` | état santé |

Le calcul de `ramp_rate` applique, pour chaque jour, `ctl += (tss - ctl) / 42` puis compare
`ctl_final - ctl_initial` au plafond. Tous les checks sont bloquants.
