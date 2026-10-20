/**
 * Source unique de tous les textes (FR) de la landing page.
 * Toute modification de copy passe par ici.
 *
 * Règle de style : aucun tiret « - » ni tiret cadratin « — » dans le texte visible.
 */

export const meta = {
  title: "Inigo, coach d'endurance sur WhatsApp",
  description:
    "Inigo construit ton plan, l'ajuste chaque semaine et t'explique chaque séance. La méthode d'un coach pro, branchée sur tes données d'entraînement.",
} as const;

export const nav = {
  items: [
    { label: "Le coach", href: "#coach" },
    { label: "La méthode", href: "#methode" },
    { label: "Ce qu'il te faut", href: "#prerequis" },
  ],
  // Ouvre WhatsApp sur mobile, descend vers le QR de « Démarrer » sur desktop (cf. StartCta).
  cta: { label: "Échanger avec Inigo" },
  // Place réservée pour un futur bouton « Connexion » (non câblé).
  login: { label: "Connexion" },
} as const;

export const hero = {
  eyebrow: "COACHING D'ENDURANCE",
  title: "Ton coach d'endurance, sur WhatsApp.",
  subtitle:
    "Inigo construit ton plan, l'ajuste chaque semaine et t'explique chaque séance. La méthode d'un coach pro, branchée sur tes données d'entraînement.",
  // Ouvre WhatsApp sur mobile, descend vers le QR de « Démarrer » sur desktop (cf. StartCta).
  ctaPrimary: { label: "Écrire à Inigo" },
  ctaSecondary: { label: "Voir la méthode", href: "#methode" },
  // Label mono posé en haut du visuel signature.
  signature: "Ton coaching, en direct",
} as const;

/**
 * Visuel signature du hero : démo produit (photo + maquette WhatsApp).
 * Ne contient que les textes de l'illustration ; la géométrie purement décorative
 * (barres du graphe, dimensions) vit dans HeroShowcase.astro.
 */
export const heroShowcase = {
  contact: { name: "Inigo", status: "en ligne" },
  dayLabel: "Aujourd'hui",
  inputPlaceholder: "Message",
  // Fil de conversation illustratif. `from` : "in" = Inigo, "out" = l'athlète.
  chat: [
    {
      from: "in",
      time: "07:14",
      text: "Cette semaine : 3 séances. Mardi tempo, jeudi seuil, dimanche sortie longue. Je t'explique le pourquoi 👇",
    },
    { from: "out", time: "07:16", text: "Jeudi je suis cuit du boulot, je peux décaler ?" },
    {
      from: "in",
      time: "07:16",
      text: "Oui. On passe le seuil à vendredi, repos jeudi. Le bloc reste cohérent.",
    },
  ],
  // Chip de notification flottante (desktop).
  chip: { name: "Inigo", time: "07:16", text: "Le bloc reste cohérent 💪" },
  // Carte stats flottante (desktop).
  stats: {
    eyebrow: "Cette semaine",
    title: "3 séances ajustées",
    days: ["L", "M", "M", "J", "V", "S", "D"],
  },
} as const;

export const coach = {
  eyebrow: "LE COACH",
  title: "Tu parles à un coach. Pas à une interface.",
  body: "Aucun tableau de bord à remplir, aucune notification à trier. Inigo part de ton objectif, ton niveau et ton temps disponible, puis prend le relais. Tu échanges avec lui sur WhatsApp, comme avec un vrai coach. Il te pousse, t'explique, et t'amène où tu veux aller.",
} as const;

export const method = {
  eyebrow: "LA MÉTHODE",
  title: "Comment Inigo te coache",
  steps: [
    {
      title: "On définit ton objectif",
      body: "Une course, un chrono, une première ligne d'arrivée ? Inigo part de ce que tu veux vraiment accomplir.",
    },
    {
      title: "Il apprend à te connaître",
      body: "Ton niveau, ce que tu pratiques déjà, ton temps disponible, et pourquoi tu cherches un coach.",
    },
    {
      title: "Tu reçois ton plan",
      body: "Un plan d'entraînement sur plusieurs semaines, construit pour ton objectif et ton quotidien.",
    },
    {
      title: "Il planifie semaine après semaine",
      body: "Chaque séance est programmée, avec la flexibilité d'un coach : un imprévu, une fatigue, et le plan s'adapte.",
    },
    {
      title: "Il analyse chaque séance",
      body: "Inigo lit tes entraînements réalisés et fait le bilan de ta semaine.",
    },
    {
      title: "Il t'explique le pourquoi",
      body: "La science derrière chaque séance, pour que tu comprennes ce que tu fais et progresses durablement.",
    },
    {
      title: "Nutrition et récupération",
      body: "Quoi manger autour de l'effort, comment récupérer, et ta stratégie le jour J. La performance se construit aussi entre les séances.",
    },
  ],
} as const;

export const whatsapp = {
  eyebrow: "SUR WHATSAPP",
  title: "Tout passe par une conversation.",
  body: "Chaque lundi, tu reçois ton planning et son explication. Une question, un doute, un imprévu ? Tu écris, Inigo répond et ajuste. La rigueur d'un coach, dans le fil où tu écris déjà tous les jours.",
  // Bulles de conversation sobres (illustration, pas une vraie conv).
  bubbles: [
    { from: "inigo", text: "Cette semaine : 3 séances. Mardi tempo, jeudi seuil, dimanche sortie longue. Je t'explique le pourquoi 👇" },
    { from: "user", text: "Jeudi je suis cuit du boulot, je peux décaler ?" },
    { from: "inigo", text: "Oui. On passe le seuil à vendredi, repos jeudi. Le bloc reste cohérent." },
  ],
} as const;

export const requirements = {
  eyebrow: "CE QU'IL TE FAUT",
  title: "Trois choses, c'est tout",
  intro:
    "Inigo travaille à partir de tes données d'entraînement. Quel que soit ton matériel, tout se synchronise sur Intervals.icu, là où Inigo planifie tes séances et lit tes résultats.",
  items: [
    {
      title: "Un outil de suivi",
      body: "Garmin, Strava, Coros, Fitbit… celui que tu utilises déjà.",
    },
    {
      title: "Un compte Intervals.icu",
      body: "Gratuit. Le hub où tout se synchronise, et où Inigo planifie et analyse.",
    },
    {
      title: "Ton numéro WhatsApp",
      body: "Pour qu'Inigo te contacte et te coache.",
    },
  ],
} as const;

/**
 * Contact WhatsApp d'Inigo. Le code d'accès doit rester celui saisi dans l'admin du coach
 * (Réglages, Onboarding) : un numéro inconnu qui écrit sans lui ne démarre pas d'onboarding.
 */
export const whatsappContact = {
  phoneNumber: "+447882748102",
  accessCode: "INIGO_BETA_2026",
} as const;

export const start = {
  eyebrow: "DÉMARRER",
  title: "Écris à Inigo sur WhatsApp.",
  subtitle:
    "Pas d'engagement. Ton premier message est déjà prêt : tu l'envoies, et Inigo te pose quelques questions sur ton objectif.",
  // Message prérempli dans WhatsApp. Le coach y cherche le code d'accès.
  message: `Bonjour Inigo, je veux démarrer mon coaching. Mon code : ${whatsappContact.accessCode}`,
  cta: "Écrire à Inigo sur WhatsApp",
  qr: {
    title: "Scanne avec ton téléphone",
    body: "WhatsApp s'ouvre avec ton premier message prêt à partir. Le coaching se vit sur ton téléphone.",
    alt: "QR code qui ouvre la conversation WhatsApp avec Inigo",
  },
  desktopLink: "Ou ouvrir WhatsApp sur cet ordinateur",
} as const;

export const footer = {
  brand: "Inigo · coaching d'endurance",
  copyright: "© 2026 Inigo",
  privacy: "Confidentialité",
} as const;
