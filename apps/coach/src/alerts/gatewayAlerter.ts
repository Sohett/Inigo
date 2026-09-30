import type { GatewayAlert } from "../domain/whatsappGateway";

/**
 * Port for telling a human that the WhatsApp gateway session is down (or back).
 *
 * `notify` never throws: an alert that fails to go out must not fail the webhook delivery or the
 * watchdog run that raised it (a failed webhook would make BullMQ replay the event, and alert
 * again, in a loop). An implementation logs a failed channel instead.
 */
export interface GatewayAlerter {
  notify(alert: GatewayAlert): Promise<void>;
}
