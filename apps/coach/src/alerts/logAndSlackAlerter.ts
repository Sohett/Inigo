import type { GatewayAlert } from "../domain/whatsappGateway";
import type { GatewayAlerter } from "./gatewayAlerter";
import { postSlackMessage } from "./slack";

export interface LogAndSlackAlerterOptions {
  /** Slack Incoming Webhook URL. Absent: alerts are only logged. */
  slackWebhookUrl?: string | undefined;
  /** Injectable fetch, primarily for testing. */
  fetchImpl?: typeof fetch;
}

/**
 * ADAPTER of `GatewayAlerter`: every alert is logged as one structured line (the durable trace in
 * the Vercel logs), then posted to Slack when a webhook URL is configured. A Slack failure is
 * logged, never thrown (see the port's contract).
 */
export function createLogAndSlackAlerter(options: LogAndSlackAlerterOptions = {}): GatewayAlerter {
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
