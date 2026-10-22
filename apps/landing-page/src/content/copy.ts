/**
 * Source unique de tous les textes (FR) de la landing page.
 * Toute modification de copy passe par ici (la démo interactive : `demo.ts`).
 *
 * Règle de style : aucun tiret « - » ni tiret cadratin « — » dans le texte visible.
 */

export const meta = {
  title: "Inigo, ton coach d'endurance sur WhatsApp",
  description:
    "Inigo lit chaque séance que tu fais et réajuste ton plan dès que ta vie change. Triathlon, vélo, course : un vrai coach, sur WhatsApp.",
} as const;

/**
 * Contact WhatsApp d'Inigo. Le code d'accès doit rester celui saisi dans l'admin du coach
 * (Réglages, Onboarding) : un numéro inconnu qui écrit sans lui ne démarre pas d'onboarding.
 */
const accessCode = "INIGO_BETA_2026";

export const whatsappContact = {
  phoneNumber: "+447882748102",
  accessCode,
  // Message prérempli dans WhatsApp. Le coach y cherche le code d'accès.
  message: `Bonjour Inigo, je veux démarrer mon coaching. Mon code : ${accessCode}`,
} as const;

export const nav = {
  homeLabel: "Inigo, accueil",
  ariaLabel: "Navigation principale",
  items: [
    { label: "Ton plan", href: "#plan" },
    { label: "Analyse", href: "#analyse" },
    { label: "La science", href: "#science" },
    { label: "Le jour J", href: "#jourj" },
    { label: "Tarifs", href: "#tarifs" },
  ],
  // Ouvre WhatsApp sur mobile, descend vers le QR de « Démarrer » sur desktop (cf. StartCta).
  cta: "Écrire à Inigo",
  skipLink: "Aller au contenu",
} as const;

export const hero = {
  eyebrow: "[Coach d'endurance sur WhatsApp] · Triathlon · Vélo · Course",
  titleLines: ["Un vrai coach.", "Sur WhatsApp."],
  subtitle:
    "Inigo lit chaque séance que tu fais et réajuste ton plan dès que ta vie change. Ce que fait un coach. Ce qu'aucune app ne fait.",
  demo: {
    label: "Essaie · Dis lui ce qui t'arrive",
    pause: "Pause",
    play: "Lecture",
    // Libellés accessibles : ils contiennent le texte visible (WCAG 2.5.3, commande vocale).
    pauseAria: "Pause de la démo automatique",
    playAria: "Lecture de la démo automatique",
  },
  qr: {
    title: "Scanne pour commencer",
    body: "WhatsApp s'ouvre avec ton premier message prêt à partir.",
  },
  desktopLink: "Ou ouvrir WhatsApp ici",
  noCommitment: "Pas d'engagement",
  phone: {
    ariaLabel: "Conversation WhatsApp avec Inigo : il réajuste ta semaine selon l'imprévu choisi",
    name: "Inigo",
    status: "a réajusté ta semaine",
    dayLabel: "Lundi",
  },
  counter: { label: "Réajustements", sub: "Pendant ta démo" },
} as const;

export const plan = {
  eyebrow: "Ton plan, en direct · Il bouge avec toi",
  goalsAriaLabel: "Objectif",
  stats: { target: "Objectif", format: "Format", hours: "Volume", duration: "Durée" },
  weeksUnit: "semaines",
  chartAriaLabel: "Volume hebdomadaire par zone jusqu'au jour J",
  raceDay: "JOUR J",
  thisWeek: "Cette semaine · Semaine",
  adjustedOne: "séance ajustée par Inigo",
  adjustedMany: "séances ajustées par Inigo",
  adjustedBadge: "AJUSTÉ PAR INIGO",
  zones: ["Z1", "Z2", "Z3", "Z4", "Z5"],
  hint: "Clique sur un imprévu plus haut · le plan se réajuste",
  compat: {
    label: "Lit tes données",
    brands: ["Garmin", "Wahoo", "Strava", "Coros", "Suunto", "Zwift"],
    via: "via Intervals.icu",
  },
} as const;

export const coach = {
  eyebrow: "Le coach",
  titleLines: ["Tu parles à un coach.", "Pas à une interface."],
  body: "Aucun tableau de bord à remplir, aucune notification à trier. Tu écris comme à un coach, il répond comme un coach.",
  imageAlt: "Deux cyclistes en montée sur une route de col au lever du soleil",
  bubbles: [
    { side: "out", time: "10:42", text: "2 h 10 de selle, les jambes sont lourdes. Je fais quand même le col ?" },
    {
      side: "in",
      time: "10:43",
      text: "Monte le en Z2, sans forcer. Tu as fait le travail utile ce matin, on garde l'intensité pour jeudi.",
    },
  ],
} as const;

export const analysis = {
  eyebrow: "[Analyse] · Chaque séance",
  title: "Il lit ta séance. Il comprend. Il ajuste.",
  body: "Dès que ta montre ou ton compteur se synchronise, Inigo compare le prévu au réalisé, cherche la cause et réajuste la suite. Puis il t'explique pourquoi, en deux phrases, comme ton coach le ferait.",
  session: "Mardi · Vélo · Sweet spot 3×12 min · cible 245 à 255 W",
  sessionStats: "1 H 30 · 162 TSS",
  chartAriaLabel: "Puissance réalisée face à la cible : blocs 1 et 2 dans la cible, bloc 3 en baisse",
  axis: { high: "250 W", low: "150 W", end: "MIN 90" },
  legend: { power: "Puissance", heartRate: "Fréquence cardiaque", target: "Cible" },
  notes: [
    { label: "1 · 2 · Ce qu'il voit", body: "Blocs 1 et 2 à 251 W de moyenne, pile dans la cible, cadence stable à 88 rpm.", highlight: false },
    {
      label: "3 · Ce qu'il comprend",
      body: "Puissance en baisse de 7 % mais FC stable : fatigue musculaire, pas cardio. Ta semaine a été chargée.",
      highlight: true,
    },
    {
      label: "→ Ce qu'il change",
      body: "Jeudi allégé, sortie longue maintenue samedi, prochain bloc à 245 W. Test FTP dans 10 jours.",
      highlight: false,
    },
  ],
  comparison: {
    caption: "Inigo face aux autres façons de s'entraîner",
    headers: ["Plan PDF", "App d'entraînement", "Chatbot IA", "Inigo"],
    rows: [
      { label: "Lit ta séance réelle", values: ["Non", "Graphiques", "Si tu copies tout", "Automatiquement"] },
      { label: "Comprend pourquoi ça s'est passé", values: ["Non", "Non", "Partiel", "Oui"] },
      { label: "Réajuste la suite du plan", values: ["Non", "Partiel", "Non", "Oui, à chaque séance"] },
      { label: "Te l'explique comme un coach", values: ["Non", "Non", "Partiel", "Oui, sur WhatsApp"] },
    ],
  },
} as const;

export const science = {
  eyebrow: "[Science] · Il t'explique le pourquoi",
  title: "Chaque séance a une raison d'exister.",
  body: "Inigo ne te dit pas seulement quoi faire. Il t'explique ce que chaque intensité construit dans ton corps, pour que tu comprennes et progresses durablement.",
  bubble: {
    time: "07:02",
    text: "Pourquoi autant de Z2 ? C'est là que tu fabriques le moteur. Le sweet spot, lui, apprend à ce moteur à tenir fort longtemps.",
  },
  zones: [
    { zone: 1, name: "Récupération", body: "Active la circulation et accélère la récupération entre deux séances dures." },
    {
      zone: 2,
      name: "Endurance",
      body: "Multiplie tes mitochondries et t'apprend à brûler les graisses. La base de tout, et la majorité de ton temps.",
    },
    {
      zone: 3,
      name: "Tempo · Sweet spot",
      body: "Le meilleur rapport gain sur fatigue pour monter ton FTP, et l'allure du vélo en triathlon longue distance.",
    },
    { zone: 4, name: "Seuil", body: "Repousse le point où le lactate s'accumule. Tu tiens plus de watts, plus longtemps." },
    { zone: 5, name: "VO2max", body: "Augmente le plafond : la quantité maximale d'oxygène que ton corps sait utiliser." },
  ],
} as const;

export const raceDay = {
  eyebrow: "Le jour J",
  title: "Le jour J se prépare aussi.",
  body: "Quels watts tenir sur le vélo, combien de glucides par heure, à quelle allure partir à pied. Inigo te donne ta stratégie de course, discipline par discipline.",
  caption: "Stratégie · Triathlon distance L",
  total: "5:21:30",
  legs: [
    { name: "NAGE", detail: "36:00", width: 11, tone: "swim" },
    { name: "VÉLO · 205 W · NP 212 W", detail: "2:48:00", width: 52, tone: "bike" },
    { name: "COURSE · 5:18 /KM", detail: "1:52:00", width: 34, tone: "run" },
  ],
  distances: ["1,9 KM", "T1 · 90 KM · T2", "21,1 KM"],
  stats: [
    { label: "Vélo", value: "80", unit: "G/H GLUCIDES" },
    { label: "Hydratation", value: "600", unit: "ML/H" },
    { label: "Course", value: "1 gel", unit: "/ 30 MIN" },
  ],
} as const;

export const pricing = {
  eyebrow: "Tarifs · Bêta",
  title: "Le suivi d'un coach. Pas son prix.",
  body: "Un coach d'endurance en ligne coûte souvent entre 100 et 200 € par mois. Inigo lit chacune de tes séances et te répond 7 jours sur 7. Pendant la bêta, c'est offert.",
  offers: [
    {
      label: "Bêta · Accès fondateur",
      price: "Gratuit",
      unit: "PENDANT LA BÊTA",
      recommended: true,
      items: [
        "Plan personnalisé jusqu'au jour J",
        "Planning expliqué chaque lundi",
        "Analyse de chaque séance et réajustements",
        "Nutrition, récupération, stratégie de course",
      ],
      cta: "Écrire à Inigo",
    },
    {
      label: "Après la bêta",
      price: "29 €",
      unit: "/ MOIS",
      recommended: false,
      items: [
        "Le même suivi, sans limite",
        "Prix fondateur garanti tant que tu restes",
        "Sans engagement, tu arrêtes quand tu veux",
        "On te prévient un mois avant la fin de la bêta",
      ],
      cta: null,
    },
  ],
  footnote: "Places limitées : on vérifie d'abord qu'Inigo est fait pour toi.",
} as const;

export const start = {
  eyebrow: "Démarrer · 3 minutes",
  title: "Ton coach t'attend sur WhatsApp.",
  steps: [
    { title: "Scanne le code.", body: "WhatsApp s'ouvre avec ton premier message prêt." },
    { title: "Réponds à quelques questions.", body: "Ton objectif, ton niveau, ton temps disponible." },
    { title: "Connecte ta montre via Intervals.icu.", body: "Gratuit. Ta première semaine arrive." },
  ],
  // Sur mobile, l'étape 1 n'a pas de QR : on ouvre WhatsApp directement.
  mobileFirstStep: { title: "Écris à Inigo.", body: "WhatsApp s'ouvre avec ton premier message prêt." },
  qr: {
    title: "Scanne avec ton téléphone",
    body: "Pas d'engagement. Ton premier message est déjà prêt à partir.",
    alt: "QR code qui ouvre la conversation WhatsApp avec Inigo",
  },
  desktopLink: "Ou ouvrir WhatsApp sur cet ordinateur",
  mobileCta: "Écrire à Inigo sur WhatsApp",
} as const;

export const footer = {
  navLabel: "Liens utiles",
  copyright: "© 2026 Inigo · Coaching d'endurance",
  privacy: "Confidentialité",
  contact: "Contact",
  contactEmail: "contact@inigo-coach.com",
} as const;
