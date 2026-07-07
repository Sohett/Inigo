# Audit du brain Inigo (Managed Agents)

> Snapshot du 2026-07-06 via `brain:pull` + `brain:memory:audit` (lecture seule, aucune
> modification faite sur le brain). Régénère avec ces deux commandes ; les données brutes sont
> dans `snapshot/` (archi) et `memory/` (gitignore, données perso).
> Portée : la **mémoire du Managed Agent** (plateforme), pas la mémoire locale de Claude Code.

## Résumé exécutif

Le brain est un **système multi-agents à coordinateur** bien conçu : 1 coordinateur (la voix +
l'orchestration) qui délègue à 4 spécialistes, un gate déterministe, 3 memory stores séparés par
périmètre, MCP en moindre privilège. L'architecture est saine. Les points d'attention portent
surtout sur **l'hygiène mémoire** et un **placement Skill vs Mémoire** à corriger :

- 🔴 le store `validators` contient du **code exécutable** monté **read_write** → à passer en Skill (ou read_only).
- 🔴 `sample-week-good.json` et `sample-week-bad.json` sont **identiques** (même sha) → le test négatif ne teste rien.
- 🟠 `adaptation-log.md` (26,6 ko) grossit sans fin ; des artefacts `runtime/*` transitoires polluent les stores durables.
- 🟠 dérive de nommage (`goals.md` vs `objectives.md`) et référence morte (`01-INTERFACE-CONTRACT.md`).
- 🟢 un agent legacy `Inigo Coach – TEST` traîne hors roster.

## Architecture actuelle

**6 agents** (5 en prod + 1 legacy). Un seul vault (`Inigo Coach`), un environnement, 7 sessions (toutes idle).

| Agent | Modèle | Rôle | MCP | Skill |
|---|---|---|---|---|
| **inigo-coordinateur** `v8` | sonnet-4-6 | Voix WhatsApp + chef d'orchestre (route, gate, état) | open-whatsapp (write) + intervals-icu (read) | intervals-icu-workouts |
| inigo-architecte-macro `v3` | opus-4-8 | Squelette de saison (macro) | intervals-icu (read) | intervals-icu-workouts |
| inigo-constructeur-hebdo `v5` | opus-4-8 | Construit les séances de la semaine, **écrit** sur Intervals | intervals-icu (write) | intervals-icu-workouts |
| inigo-analyste-post-seance `v3` | opus-4-8 | Analyse post-séance (streams, courbes), diagnostique | intervals-icu (read) | intervals-icu-workouts |
| inigo-readaptateur `v6` | opus-4-8 | Réajuste la semaine en cours, **écrit** sur Intervals | intervals-icu (write) | intervals-icu-workouts |
| ~~Inigo Coach – TEST~~ `v7` | sonnet-4-6 | **Legacy** mono-agent, hors roster | intervals-icu + open-whatsapp | aucun |

Le coordinateur déclare le roster multi-agents (`multiagent.coordinator` → les 4 spécialistes,
versions épinglées). Séparation de responsabilité nette (un seul agent parle à l'athlète ;
les écritures Intervals passent par le gate). Étagement des modèles sensé (sonnet pour router/
parler, opus pour le raisonnement lourd). MCP en moindre privilège (tools activés un par un,
`default_config.enabled=false`). **Rien à redire sur la topologie.**

**Skills** : 1 custom (`intervals-icu-workouts`) + 4 pré-bâtis Anthropic (xlsx/pptx/pdf/docx,
disponibles mais non attachés). Le custom est attaché aux 5 agents prod.

## État de la mémoire (3 stores)

| Store | mount | Mém. | Taille | Accès (sessions) | Verdict |
|---|---|---|---|---|---|
| `validators` | `/mnt/memory/validators` | 6 | 17,6 ko | **read_write ×3** | 🔴 mauvais outil (code) |
| `Inigo Knowledge Base` | `/mnt/memory/inigo-knowledge-base` | 32 | 51 ko | read_only ×5, **read_write ×1** | 🟢 bonne structure, à figer en read_only |
| `[ATHLETE] Inigo - Thomas Sohet` | `/mnt/memory/athlete-inigo-thomas-sohet` | 13 | 71,5 ko | read_write ×6 | 🟢 usage correct, à nettoyer |

- **Knowledge Base** : structure exemplaire (petits fichiers ciblés `~1,5–2,5 ko`, arbre par
  domaine : periodization/, physiology/, workout-construction/, load-management/, tapering/,
  references/, + Index.md + _TEMPLATE.md avec frontmatter versionné). C'est le modèle à suivre.
- **Athlète** : usage mémoire correct (état évolutif que les agents lisent/écrivent). Les
  instructions de montage documentent une matrice de propriété par fichier (écrivain unique).

## Findings (par sévérité)

### 🔴 1. Le gate `validators` est du code, monté en écriture
`validators/run.py` (7,2 ko) et `test_validators.py` sont du **code exécutable** (`python
validators/run.py`), monté **read_write** dans les 3 sessions concernées. Un agent — ou une
injection de prompt via un message athlète — pourrait **réécrire la logique du gate**, dont tout
l'intérêt est d'être déterministe et non contournable. Du code author-controlled versionné =
définition exacte d'un **Skill** (les scripts de niveau 3 sont exécutés, jamais chargés en
contexte). → Migrer `validators/` vers un **Skill** attaché au coordinateur (+ constructeur/
réadaptateur). À défaut, au minimum le monter **read_only**.

### 🔴 2. Fixtures de test identiques
`sample-week-good.json` et `sample-week-bad.json` ont le **même sha256** (`701e5f72…`) : ils sont
byte-à-byte identiques. Le cas « mauvais » ne peut donc pas vérifier un rejet. → Régénérer un
`sample-week-bad.json` qui viole réellement une règle (ramp trop élevé, % Z4+ hors borne…).

### 🟠 3. `adaptation-log.md` grossit sans borne
26,6 ko et append-only multi-auteurs. Plafond dur = 100 ko/mémoire. → Découper par période
(`adaptation-log/2026-W28.md`) ou condenser périodiquement (résumer l'ancien, garder le récent).

### 🟠 4. Artefacts `runtime/*` transitoires dans les stores durables
`runtime/proposed-week.json` (15,4 ko), `runtime/validation-report.json`,
`runtime/readaptation-request.json` — état de cycle du gate, présent **à la fois** dans le store
athlète et le store validators. Ça gonfle la mémoire durable et duplique. → Traiter comme
éphémère (scratch container non persisté) ou nettoyer après chaque cycle de gate.

### 🟠 5. Dérive de nommage `objectives.md` vs `goals.md`
Les prompts (architecte) **et** les instructions de montage du store athlète disent que
l'Architecte écrit `objectives.md` ; le store contient en fait `goals.md`. Le fichier attendu par
le système n'existe pas sous ce nom. → Renommer `goals.md` → `objectives.md` (ou corriger prompts
+ instructions). Risque : l'Architecte ne trouve pas le fichier qu'il croit écrire/relire.

### 🟠 6. Référence morte `01-INTERFACE-CONTRACT.md`
Les instructions de montage citent `../01-INTERFACE-CONTRACT.md §2/§3/§5` (matrice de propriété,
format task-envelope, contrat de gate) mais **aucun fichier de ce nom n'existe** dans les 3
stores. Les agents sont renvoyés vers un contrat absent. → L'ajouter (mémoire partagée ou skill)
ou corriger les références.

### 🟢 7. Namespaces de chemins ≠ slugs de montage
Les prompts utilisent `athlete-model/…` et `knowledge-base/…` ; les montages réels sont
`/mnt/memory/athlete-inigo-thomas-sohet/…` et `/mnt/memory/inigo-knowledge-base/…`. Ça ne marche
que si le modèle fait le pont. → Renommer les stores en `athlete-model` et `knowledge-base` (le
slug de montage suivra) **ou** utiliser les vrais chemins dans les prompts. Le renommage est plus propre.

### 🟢 8. Agent legacy hors roster
`Inigo Coach – TEST` (mono-agent, sonnet, sans skill) n'est plus dans le roster. → L'archiver
(`ant beta:agents archive` / `client.beta.agents.archive`) pour réduire la confusion et la surface.

### 🟢 9. Skill workout attaché trop largement (mineur)
`intervals-icu-workouts` est attaché aussi à l'architecte (macro) et à l'analyste (lecture seule),
qui n'écrivent jamais de séance. Inoffensif (~100 tokens de métadonnées/agent) mais seuls le
constructeur et le réadaptateur en ont besoin. → Détacher des 3 autres si tu veux épurer.

## Skill vs Mémoire — la règle appliquée à ton système

| Élément | Aujourd'hui | Devrait être | Pourquoi |
|---|---|---|---|
| Modèle athlète | Mémoire (rw) | ✅ Mémoire (rw) | État évolutif, par athlète, écrit par les agents |
| `intervals-icu-workouts` | Skill | ✅ Skill | Expertise procédurale stable que tu versionnes |
| **validators (code)** | Mémoire (rw) | ➡️ **Skill** | Code exécutable author-owned ; ne doit pas être mutable au runtime |
| **Knowledge Base** | Mémoire (majorité read_only) | ➡️ **Mémoire read_only** (ou Skill) | Référence stable que tu écris, que les agents ne font que lire |

**Règle de décision** (à réutiliser) : tu l'édites dans le repo puis redéploies → **Skill**.
L'agent doit l'accumuler/le mettre à jour au fil de l'eau, par user/projet → **Mémoire**.
- Pour la KB, les deux se défendent. Reco : la garder en **mémoire read_only** (colle à ton
  intention « science séparée, mise à jour seule quand la recherche évolue », éditable depuis git
  via `brain:memory`). La passer en Skill si un jour tu veux la versionner en lockstep avec les
  releases d'agents.
- Pour les validators : **Skill** sans hésiter (c'est du code, le risque d'intégrité tranche).

## Reco priorisées (et comment, via `@inigo/brain`, écritures gated)

1. **Rendre validators + KB non-écrivables par les agents.** L'accès mémoire se fige à la
   **création de session** (immuable ensuite) → recréer les sessions avec `access: read_only` pour
   validators (partout) et KB (la session read_write résiduelle). Idéalement, migrer `validators/`
   en Skill (`brain:skill:deploy`), puis retirer le store.
2. **Corriger les fixtures** good/bad identiques (édition mémoire ou dans le futur Skill).
3. **Réconcilier `objectives.md`/`goals.md`** + **ajouter `01-INTERFACE-CONTRACT.md`** (ou corriger les refs).
4. **Découper/condenser `adaptation-log.md`** ; **arrêter de persister `runtime/*`** dans les stores durables.
5. **Renommer les stores** (`athlete-model`, `knowledge-base`) pour matcher les prompts, ou l'inverse.
6. **Archiver** l'agent legacy `Inigo Coach – TEST`.

Nuance outillage : `brain:agent:apply` (versions) et `brain:skill:deploy` sont prêts ;
l'édition mémoire et le changement d'accès (recréation de session) se font pour l'instant via le
SDK/`ant` (recettes dans le skill `managed-agents-api`). Tout reste **gated** : rien n'a été
modifié sur le brain par cet audit.
