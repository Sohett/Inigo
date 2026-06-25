import { LEAD_WEBHOOK_URL, LEAD_WEBHOOK_SECRET } from "astro:env/server";

export interface Lead {
  firstName?: string;
  /** Numéro normalisé en E.164. */
  phone: string;
  consent: true;
  /** D'où vient le lead (ex. `landing-page`). */
  source: string;
  /** Horodatage ISO 8601. */
  createdAt: string;
}

/**
 * Transmet un nouveau lead au webhook externe (n8n / Make / Zapier / WhatsApp…).
 * Décision produit : pas de DB ni d'email — le webhook est le canal de notification.
 *
 * - URL absente : en dev on log le lead (numéro masqué) et on considère l'envoi OK,
 *   pour ne pas bloquer le formulaire en local. En prod, l'appelant traite l'absence
 *   d'URL comme une erreur serveur.
 * - Le numéro n'est jamais loggué en clair ailleurs que dans le payload du webhook.
 */
export async function notifyNewLead(lead: Lead): Promise<void> {
  if (!LEAD_WEBHOOK_URL) {
    if (import.meta.env.PROD) {
      throw new Error("LEAD_WEBHOOK_URL non configuré en production.");
    }
    console.warn(
      `[lead] LEAD_WEBHOOK_URL absent — lead non transmis (tel: ${maskPhone(lead.phone)})`,
    );
    return;
  }

  const response = await fetch(LEAD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(LEAD_WEBHOOK_SECRET ? { "x-webhook-secret": LEAD_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify(lead),
  });

  if (!response.ok) {
    throw new Error(`Webhook lead a répondu ${response.status}.`);
  }
}

function maskPhone(phone: string): string {
  return phone.length <= 5 ? "***" : `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}
