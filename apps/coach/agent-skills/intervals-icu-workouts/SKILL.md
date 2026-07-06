---
name: intervals-icu-workouts
description: Rédige des séances structurées au format texte du workout builder Intervals.icu (durées, cibles puissance/FC/allure, rampes, répétitions, cadence). À utiliser dès qu'il faut créer ou modifier une séance planifiée pour l'athlète (vélo, course, natation). Le texte produit se met dans le champ `description` du tool MCP create_or_update_event, avec un `type` cohérent avec la cible (allure pour Run/Swim, puissance pour Ride).
---

# Séances Intervals.icu (workout builder)

Intervals.icu sait transformer une description texte en séance structurée : étapes,
graphe, cibles ERG. Cette skill donne la syntaxe pour écrire ces descriptions. Le rendu
sur Intervals.icu dépend directement du texte : une ligne mal formée ne se parse pas.

La **référence exhaustive** (toutes les cibles, unités, cas particuliers) et une
**bibliothèque d'exemples complets** vivent à côté de ce fichier :

```
reference/syntaxe-workout.md
```

Écris la syntaxe essentielle de mémoire ; ouvre la référence dès qu'il faut une variante
(zones custom, MMP, prompts temporisés, allures en /100m, exemples course/natation).

## Où va la séance : le tool MCP

Une fois la séance rédigée, planifie-la avec le tool
`intervals-icu-mcp:create_or_update_event` :

- `startDateLocal` : date locale `YYYY-MM-DD` (ou datetime ISO).
- `category` : `"WORKOUT"` pour une séance planifiée.
- `name` : titre court de la séance.
- `type` : `"Ride"`, `"Run"` ou `"Swim"`. **Décisif** : c'est lui qui fixe l'interprétation
  des cibles (une même ligne `10m 80%` = % FTP en `Ride`, % d'allure seuil en `Run`).
- `description` : **le texte de la séance au format ci-dessous**.

Pour modifier une séance existante, passe son `eventId` au même tool.

## Format d'une ligne

Une étape = une ligne :

```
[durée|distance] [cible] [cadence?]
```

Exemples : `5m30s 60% 90rpm`, `1km 70% HR`, `500mtr 5:00/km Pace`.

## Syntaxe essentielle

- **Durées** : `1h`, `10m`, `30s`, combinées `1h2m30s`. Raccourcis : `5'` (minutes),
  `30"` (secondes). ⚠ `m` = **minutes**.
- **Distances** : `500mtr`, `2km`, `1mi`. ⚠ `mtr` = **mètres** (jamais `m`, qui vaut minutes).
- **Puissance** (Ride) : `75%` (% FTP), plage `95-105%`, watts `220w`, zone `Z2`, plage `Z3-Z4`.
- **Fréquence cardiaque** : `70% HR` (% FC max), `95% LTHR` (% seuil), `Z2 HR`.
- **Allure** (Run/Swim) : `80% Pace` (% allure seuil), absolue `5:00/km Pace`, `Z2 Pace`.
- **Cadence** : `90rpm` (en fin de ligne).
- **Rampe** : `10m ramp 50%-75%` (montée progressive de la cible).
- **Répétitions** : `4x` avant un bloc, ou dans un titre de section `Main Set 4x`.
- **Freeride** : `20m freeride` (désactive le mode ERG, effort libre).

## Règles d'or

- **Une ligne vide avant et après** chaque bloc de répétition.
- **Pas de répétitions imbriquées** (`4x` dans un `3x` n'est pas supporté).
- **`type` cohérent avec la cible** : allure => `Run`/`Swim`, puissance => `Ride`. Une cible
  d'allure sur un event `Ride` ne s'interprète pas comme voulu.
- Sépare les sections (échauffement, corps, retour au calme) par des lignes vides.

## Exemples complets

**Vélo, sweet spot (event `type: Ride`)**

```
Échauffement
- 12m ramp 50%-75% 85rpm

Corps 3x
- 12m 90% 90rpm
- 5m Z1 85rpm

Retour au calme
- 8m ramp 60%-40% 80rpm
```

**Course, intervalles au seuil (event `type: Run`)**

```
Échauffement
- 10m 70% Pace

5x
- 1km 98-102% Pace
- 2m 70% Pace

Retour au calme
- 10m 70% Pace
```

D'autres exemples (VO2max, over-under, natation en /100m) sont dans
`reference/syntaxe-workout.md`.
