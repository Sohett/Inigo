import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalise un numéro en E.164 (`+32470123456`).
 * Accepte le format international ; pays par défaut `BE` pour les numéros locaux
 * (le champ envoie déjà de l'E.164 — `BE` ne sert que de repli).
 * Renvoie `null` si le numéro est invalide.
 */
export function normalizePhone(
  input: string,
  defaultCountry: CountryCode = "BE",
): string | null {
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return null;
  }
  return parsed.number;
}
