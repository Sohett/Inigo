import { z } from "zod";

/**
 * Schéma de lead partagé client (react-hook-form) ET serveur (route /api/lead).
 * La validation E.164 du numéro est faite à part dans `phone.ts` : ici on garantit
 * seulement la forme du payload.
 */
export const leadSchema = z.object({
  // Prénom optionnel ; chaîne vide tolérée (transformée plus tard si besoin).
  firstName: z.string().trim().max(60, "60 caractères maximum.").optional(),
  // Présence d'un numéro ; la validité réelle est vérifiée via libphonenumber-js.
  phone: z.string().trim().min(1, "Numéro requis."),
  // Consentement obligatoire (case cochée). `boolean` + refine → seul `true` passe,
  // tout en gardant un type client (react-hook-form) propre (defaultValue `false`).
  consent: z.boolean().refine((value) => value === true, {
    message: "Consentement requis.",
  }),
  // Honeypot anti-bot : doit rester vide (cf. spec §8).
  _hp: z.string().optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;
