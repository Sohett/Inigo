# Référence : syntaxe du workout builder Intervals.icu

Source de vérité : forum officiel Intervals.icu, « Workout builder syntax quick guide »
(t/123701), complété par des exemples de la communauté. Cette référence documente la
syntaxe texte qu'Intervals.icu parse en séance structurée.

## Sommaire

- [Format d'une ligne](#format-dune-ligne)
- [Durées](#durées)
- [Distances](#distances)
- [Cibles de puissance](#cibles-de-puissance)
- [Cibles de fréquence cardiaque](#cibles-de-fréquence-cardiaque)
- [Cibles d'allure](#cibles-dallure)
- [Cadence](#cadence)
- [Rampes](#rampes)
- [Freeride (effort libre)](#freeride-effort-libre)
- [Répétitions](#répétitions)
- [Sections et titres](#sections-et-titres)
- [Prompts texte](#prompts-texte)
- [Prompts temporisés dans une étape](#prompts-temporisés-dans-une-étape)
- [Mise en forme](#mise-en-forme)
- [Bibliothèque d'exemples complets](#bibliothèque-dexemples-complets)

## Format d'une ligne

Chaque étape tient sur une ligne :

```
[durée|distance] [cible] [cadence?]
```

- `durée|distance` : obligatoire, c'est ce qui déclenche le parsing d'une étape.
- `cible` : puissance, FC ou allure (voir sections dédiées). Optionnelle (sans cible =
  étape libre).
- `cadence` : optionnelle, en fin de ligne.

Exemples : `5m30s 60% 90rpm`, `1km 70% HR`, `500mtr 5:00/km Pace`.

Les étapes sont souvent préfixées par un tiret `-` pour la lisibilité (`- 10m 75%`), mais
le tiret est facultatif.

## Durées

- Heures : `1h`
- Minutes : `10m`
- Secondes : `30s`
- Combinées : `1h2m30s`
- Raccourcis : `5'` (minutes), `30"` (secondes)

⚠ **Piège** : `m` signifie **minutes**. Pour des mètres, voir Distances.

## Distances

- Métrique : `500mtr` (mètres), `2km`
- Impérial : `1mi`, `4.5mi`

⚠ **Piège** : les mètres s'écrivent **`mtr`**, jamais `m` (qui vaut minutes).

## Cibles de puissance

Interprétées quand l'event est de `type: Ride` (ou tout sport à puissance).

- % de la FTP : `75%`
- Plage de % : `95-105%`
- Watts absolus : `220w`
- Zone : `Z2`
- Plage de zones : `Z3-Z4`
- Basé MMP (Mean Maximal Power) : `60% MMP 5m` (60 % de la meilleure puissance sur 5 min)
- Zones personnalisées de l'athlète : mêmes notations que les zones standard

## Cibles de fréquence cardiaque

- % de la FC max : `70% HR`, plage `75-80% HR`
- % de la FC seuil (LTHR) : `95% LTHR`, plage `90-95% LTHR`
- Zone de FC : `Z2 HR`, plage `Z2-Z3 HR`

## Cibles d'allure

Interprétées quand l'event est de `type: Run` ou `Swim`.

- % de l'allure seuil : `60% Pace`, plage `78-82% Pace`
- Zone d'allure : `Z2 Pace`, plage `Z2-Z3 Pace`
- Allure absolue : `5:00 Pace`, `5:00/km Pace`, plage `3:00/100m-4:00/100m Pace`

Unités d'allure disponibles : `/km`, `/mi`, `/100m`, `/100y`, `/500m`, `/400m`, `/250m`.

## Cadence

En fin de ligne, en tours par minute : `90rpm`.

Exemple : `10m 88% 85rpm`.

## Rampes

Montée (ou descente) progressive de la cible sur la durée de l'étape :

```
10m ramp 50%-75%
```

Fonctionne aussi avec une descente : `8m ramp 60%-40%`.

## Freeride (effort libre)

```
20m freeride
```

Désactive le mode ERG : l'athlète pédale librement, sans cible imposée par le home trainer.

## Répétitions

Deux façons de déclarer un bloc répété.

**En titre de section** (le compteur est sur le titre) :

```
Main Set 4x
- 2m 95%
- 2m 55%
```

**En bloc autonome** (le compteur `Nx` précède les étapes) :

```
5x
- 30s 120%
- 30s 50%

- 5m 50%
```

**Règles** :

- Laisse **une ligne vide avant et après** chaque bloc de répétition.
- Les **répétitions imbriquées ne sont pas supportées**.

## Sections et titres

Organise la séance en sections (échauffement, corps, retour au calme), séparées par des
lignes vides. Un titre de section peut porter un compteur de répétitions (`Main Set 4x`).

## Prompts texte

Le texte placé **avant la première durée** d'une étape devient une consigne (cue) affichée
au moment de l'étape.

Un titre de section avec compteur de répétitions génère des consignes numérotées
automatiquement (`Main Set 1/6`, `Main Set 2/6`, ...).

## Prompts temporisés dans une étape

Pour afficher plusieurs consignes à des instants précis d'une même étape :

```
[consigne à 0s]   [t1]^[consigne à t1s]   [t2]^[consigne à t2s]   <!> [durée] [cible]
```

- Les temps sont en **secondes depuis le début de l'étape**.
- `<!>` est **obligatoire** dès qu'on utilise des prompts temporisés : il sépare les
  consignes de la définition de l'étape.

Exemple :

```
- Première consigne à 0s    33^Deuxième consigne à 33s    <!> 10m ramp 25-75%
```

## Mise en forme

Le Markdown (titres, gras, italique, tableaux, liens) et les classes Vuetify sont tolérés
pour la lisibilité et **n'affectent pas** le parsing des étapes.

## Bibliothèque d'exemples complets

### Vélo — Endurance générale (`type: Ride`)

```
Échauffement
- 10m ramp 50%-75% 90rpm

Corps
- 20m 75% 90rpm
- 10m 65% 85rpm
- 10m ramp 70%-85% 90rpm

Retour au calme
- 10m ramp 50%-40% 85rpm
```

### Vélo — VO2max (`type: Ride`)

```
Échauffement
- 10m ramp 50%-65% 90rpm

Main Set 5x
- 3m 120% 100rpm
- 2m Z1 85rpm

Retour au calme
- 8m ramp 50%-40% 80rpm
```

### Vélo — Over-under progressif (`type: Ride`)

```
Échauffement
- 15m ramp 50%-70% 85rpm

Main Set 3x
- 5m ramp 95%-105% 95rpm
- 2m 70% 85rpm
- 3m 120% 100rpm
- 3m Z1 85rpm

Retour au calme
- 12m ramp 65%-40% 80rpm
```

### Vélo — Sweet spot avec variations de cadence (`type: Ride`)

```
Échauffement
- 12m ramp 50%-75% 85rpm

Corps
- 10m 88% 85rpm
- 5m 88% 70rpm
- 10m 88% 90rpm
- 5m Z1 85rpm

Retour au calme
- 8m ramp 50%-40% 80rpm
```

### Course — Fractionné au seuil (`type: Run`)

```
Échauffement
- 10m 70% Pace

Main Set 5x
- 1km 98-102% Pace
- 2m 70% Pace

Retour au calme
- 10m 70% Pace
```

### Natation — Série au seuil (`type: Swim`)

```
Échauffement
- 300mtr 65% Pace

Main Set 8x
- 100mtr 90-95% Pace
- 20s Z1 Pace

Retour au calme
- 200mtr 60% Pace
```
