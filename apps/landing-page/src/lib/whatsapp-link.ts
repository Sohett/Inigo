/**
 * Lien `wa.me` qui ouvre la conversation avec Inigo, message prérempli.
 *
 * `wa.me` attend le numéro en chiffres seuls (indicatif pays inclus, sans `+` ni espaces) ;
 * le message passe en `text`, encodé.
 */
export function whatsappLink(phoneNumber: string, message: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
