import { postSlackMessage } from "./slack";

/**
 * What happened to the WhatsApp gateway session. `down` means athletes' messages may no longer
 * reach the coach; `recovered` means they do again.
 */
export type GatewayAlertSeverity = "down" | "recovered";

/** Who noticed: OpenWA telling us through its webhook, or our own watchdog asking it. */
export type GatewayAlertSource = "webhook" | "watchdog";

export interface GatewayAlert {
  severity: GatewayAlertSeverity;
  source: GatewayAlertSource;
  /** Short, stable machine code (e.g. `session_disconnected`), for log search. */
  code: string;
  /** One human sentence: what is wrong and, when known, what to do. */
  message: string;
  /** The gateway session concerned, when known. An infrastructure id, not a secret. */
  sessionId?: string;
}

/**
 * Port for telling a human that the WhatsApp gateway session is down (or back).
 *
 * `notify` never throws: an alert that fails to go out must not fail the webhook delivery or the
 * watchdog run that raised it (a failed webhook would make BullMQ replay the event, and alert
 * again, in a loop). A failed channel is logged instead.
 */
export interface GatewayAlerter {
  notify(alert: GatewayAlert): Promise<void>;
}

export interface GatewayAlerterOptions {
  /** Slack Incoming Webhook URL. Absent: alerts are only logged. */
  slackWebhookUrl?: string | undefined;
  /** Injectable fetch, primarily for testing. */
  fetchImpl?: typeof fetch;
}

/**
 * The alerter: every alert is logged as one structured line (the durable trace in the Vercel
 * logs), then posted to Slack when a webhook URL is configured.
 */
export function createGatewayAlerter(options: GatewayAlerterOptions = {}): GatewayAlerter {
  const { slackWebhookUrl, fetchImpl } = options;
  return {
    async notify(alert: GatewayAlert): Promise<void> {
      const line = `[coach][alert] ${JSON.stringify({ scope: "whatsapp_gateway", ...alert })}`;
      if (alert.severity === "down") console.error(line);
      else console.info(line);

      if (!slackWebhookUrl) return;
      try {
        await postSlackMessage(slackWebhookUrl, slackText(alert), fetchImpl);
      } catch (error) {
        // The URL itself is a credential: log the failure, never the target.
        console.error(
          `[coach][alert] slack delivery failed code=${alert.code}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  };
}

/** Read the Slack webhook where it is used, never in `configSchema` (see `openWaCredentials`). */
export function slackWebhookUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env["SLACK_ALERT_WEBHOOK_URL"] || undefined;
}

function slackText(alert: GatewayAlert): string {
  const head =
    alert.severity === "down"
      ? ":rotating_light: *WhatsApp : les messages des athlètes n'arrivent peut-être plus*"
      : ":white_check_mark: *WhatsApp : la session est de nouveau opérationnelle*";
  const session = alert.sessionId ? ` · session \`${alert.sessionId}\`` : "";
  return `${head}\n${alert.message}\n_${alert.source} · ${alert.code}${session}_`;
}
