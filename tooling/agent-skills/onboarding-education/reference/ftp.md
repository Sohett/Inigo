# FTP : la régler pendant l'onboarding

La **FTP** est la puissance que tu peux tenir environ une heure. Toutes les séances vélo sont
calées dessus en % de FTP : une FTP fausse, c'est des séances trop dures ou trop faciles.

Commence par demander s'il roule avec un **capteur de puissance** ou un **home trainer
connecté**. Puis un seul des cas suivants :

1. **Intervals a une eFTP** (lis `get_wellness` sur les derniers jours, prends le jour le plus
   récent dont `sportInfo` contient `type: "Ride"`, champ `eftp`, arrondi au watt) :
   c'est une FTP estimée à partir de ses meilleurs efforts récents. Propose-la (« Intervals
   t'estime à 245 W, ça te parle ? »). S'il confirme : `update_sport_settings` (sport `Ride`,
   `ftp`), puis, seulement si cet appel a réussi, `update_profile` avec `ftpStatus: "confirmed"`.
2. **Il connaît sa FTP** (test récent) : même chose avec sa valeur. Si elle est très loin de
   l'eFTP, dis-le simplement et laisse-le trancher.
3. **Capteur, mais FTP inconnue ou douteuse** : `ftpStatus: "to_test"`. Explique que la
   première semaine contiendra un test, et que ses zones seront réglées dessus ensuite.
4. **Pas de capteur** : `ftpStatus: "heart_rate_only"`. Rassure : on coache très bien à la
   fréquence cardiaque et aux sensations, les séances seront données en zones de FC.

N'écris la FTP sur Intervals qu'une fois, pour la valeur initiale. Ensuite c'est l'analyste
qui la fait évoluer à partir des séances.
