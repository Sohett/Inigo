import { ConnectionResult } from "@/domain/intervalsConnection";

/**
 * What the athlete reads for each way a connection can end (INI-69). French, tutoiement, and no
 * dash in visible copy. Exhaustive: a new result does not compile until it has its words.
 */
export const RESULT_COPY: Record<ConnectionResult, { title: string; body: string }> = {
  [ConnectionResult.Connected]: {
    title: "C'est connecté",
    body: "Inigo a maintenant accès à ton compte Intervals.icu. Retourne sur WhatsApp pour la suite."
  },
  [ConnectionResult.Denied]: {
    title: "Connexion annulée",
    body: "Tu as refusé l'accès sur Intervals.icu. Sans cet accès, Inigo ne peut ni suivre tes séances ni écrire ton plan. Rouvre le lien reçu sur WhatsApp quand tu veux recommencer."
  },
  [ConnectionResult.MissingScopes]: {
    title: "Il manque des autorisations",
    body: "Inigo a besoin de toutes les autorisations demandées : activités, wellness, calendrier et réglages. Rouvre le lien reçu sur WhatsApp et laisse toutes les cases cochées."
  },
  [ConnectionResult.ExpiredLink]: {
    title: "Ce lien a expiré",
    body: "Pour ta sécurité, un lien de connexion ne reste valable que 72 heures. Demande un nouveau lien à Inigo sur WhatsApp."
  },
  [ConnectionResult.InvalidLink]: {
    title: "Ce lien ne fonctionne pas",
    body: "Il est incomplet ou n'est plus valable. Demande un nouveau lien à Inigo sur WhatsApp."
  },
  [ConnectionResult.SessionMismatch]: {
    title: "Recommence depuis ton lien",
    body: "La connexion doit se faire de bout en bout dans le même navigateur. Rouvre le lien reçu sur WhatsApp et va jusqu'au bout sans changer d'application."
  },
  [ConnectionResult.OtherAccount]: {
    title: "Un autre compte est déjà relié",
    body: "Ton compte Inigo est déjà relié à un autre compte Intervals.icu, rien n'a été changé. Écris à Inigo sur WhatsApp si tu veux changer de compte."
  },
  [ConnectionResult.Unavailable]: {
    title: "Connexion indisponible",
    body: "La connexion à Intervals.icu n'est pas encore ouverte. Inigo t'explique sur WhatsApp comment faire autrement."
  },
  [ConnectionResult.Failed]: {
    title: "La connexion n'a pas abouti",
    body: "Intervals.icu n'a pas confirmé la connexion. Rouvre le lien reçu sur WhatsApp pour réessayer."
  }
};
