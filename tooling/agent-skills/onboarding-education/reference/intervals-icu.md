# Intervals.icu : mise en place

## Ce que c'est, en une phrase

Intervals.icu est la plateforme où arrivent toutes tes sorties et où Inigo écrit ton plan.
Tu y vois tes séances prévues, ce que tu as réellement fait, et l'évolution de ta condition et de ta fraîcheur.
C'est gratuit (un don est possible, pas obligatoire).

## S'il demande pourquoi (« tu peux pas juste prendre mon Garmin ou mon Strava ? »)

Réponds en coach, en deux ou trois phrases, sans liste technique :
- c'est là que j'écris tes séances (elles peuvent partir sur ta montre si elle y est
  connectée en direct) ;
- c'est là que je vois ce que tu as vraiment fait, avec toutes les données de ta montre
  (Strava en bloque une bonne partie), pour analyser chaque séance et ajuster la suite ;
- tu ne changes rien à tes habitudes : tu connectes ta montre à Intervals en direct, elle
  continue d'envoyer tes sorties sur Strava comme avant, Intervals tourne en arrière-plan.

## Parcours A : l'athlète a déjà un compte

1. Vérifier que ses sorties y arrivent bien (montre ou compteur connecté).
2. Le connecter à Inigo par le **lien de connexion** :
   - appeler `get_intervals_connect_link` et lui envoyer le lien tel quel, avec une phrase : il
     ouvre une page Inigo, puis Intervals.icu lui demande d'autoriser l'accès ; il doit laisser
     **toutes les cases cochées** et cliquer sur autoriser ;
   - le lien est personnel et vaut 72 heures. S'il a expiré ou si l'athlète a fermé la page,
     redemande simplement un lien ;
   - quand c'est fait, tu reçois un tour `evenement: intervals_connecte` avec un `message` vide :
     l'athlète n'a rien écrit, c'est la connexion qui te prévient. Confirme en une phrase sur
     WhatsApp et enchaîne sur ce qui manque ;
   - pas de clé à copier, rien de sensible ne passe par WhatsApp.
3. Si `get_intervals_connect_link` répond `oauth_unavailable` : la connexion est momentanément
   indisponible. Dis-le simplement et repropose le lien plus tard. Jamais de clé API.

## Parcours B : pas encore de compte

1. Créer le compte sur https://intervals.icu (bouton d'inscription, email et mot de passe).
2. Connecter sa source de données dans **Settings**, section des connexions :
   - de préférence la marque de la montre ou du compteur en direct (Garmin, Wahoo, Coros,
     Polar, Suunto…) : les données arrivent complètes ;
   - Strava en dernier recours : certaines données y sont limitées pour les applications tierces.
3. Si la plateforme le propose, importer l'historique récent : plus il y a de sorties, plus
   la forme et l'eFTP sont fiables dès le départ.
4. Puis le lien de connexion, comme au parcours A.

## Vérifier que ça marche

Une fois connecté, `get_activities` sur les dernières semaines doit renvoyer des
sorties. Si la liste est vide alors que l'athlète roule, c'est que la montre ou Strava n'est
pas connectée (ou que l'import n'est pas fini) : guide-le, ce n'est pas bloquant pour la suite.
