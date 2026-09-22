import { getWhatsappSessionId, setWhatsappSessionId, type Db } from "@inigo/db";
import type { WhatsappGatewayRepository } from "./whatsappGatewayRepository";

/** Drizzle adapter for `WhatsappGatewayRepository`, over the singleton `whatsapp_gateway` row. */
export function createDrizzleWhatsappGatewayRepository(db: Db): WhatsappGatewayRepository {
  return {
    getSessionId: () => getWhatsappSessionId(db),
    setSessionId: (sessionId: string) => setWhatsappSessionId(db, sessionId)
  };
}
