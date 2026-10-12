# Intervals.icu : mise en place

## Ce que c'est, en une phrase

Intervals.icu est la plateforme où arrivent toutes tes sorties et où Inigo écrit ton plan.
Tu y vois tes séances prévues, ce que tu as réellement fait, et l'évolution de ta forme.
C'est gratuit (un don est possible, pas obligatoire).

## Parcours A : l'athlète a déjà un compte

1. Vérifier que ses sorties y arrivent bien (montre ou compteur connecté).
2. Lui faire trouver sa clé API :
   - sur intervals.icu, ouvrir **Settings** (menu, en haut à droite) ;
   - descendre jusqu'à la section **Developer Settings** ;
   - à la ligne **API Key**, générer la clé si besoin, puis la copier ;
   - la coller telle quelle dans WhatsApp, en un message.
3. Le backend la vérifie et la stocke chiffrée. Tu reçois ensuite un marqueur
   `[clé Intervals reçue et validée]` ou `[clé Intervals invalide]`. Tu ne vois jamais la clé
   et tu ne demandes jamais à l'athlète de la répéter dans la conversation, sauf si elle était invalide.

## Parcours B : pas encore de compte

1. Créer le compte sur https://intervals.icu (bouton d'inscription, email et mot de passe).
2. Connecter sa source de données dans **Settings**, section des connexions :
   - de préférence la marque de la montre ou du compteur en direct (Garmin, Wahoo, Coros,
     Polar, Suunto, Zwift…) : les données arrivent complètes ;
   - Strava en dernier recours : certaines données y sont limitées pour les applications tierces.
3. Si la plateforme le propose, importer l'historique récent : plus il y a de sorties, plus
   la forme et l'eFTP sont fiables dès le départ.
4. Puis la clé API, comme au parcours A.

## Vérifier que ça marche

Une fois la clé validée, `get_activities` sur les dernières semaines doit renvoyer des
sorties. Si la liste est vide alors que l'athlète roule, c'est que la montre ou Strava n'est
pas connectée (ou que l'import n'est pas fini) : guide-le, ce n'est pas bloquant pour la suite.
