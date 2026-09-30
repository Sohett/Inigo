import { GatewayAlertSeverity, type GatewayAlert } from "../domain/whatsappGateway";
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
      if (alert.severity === GatewayAlertSeverity.Recovered) console.info(line);
      else console.error(line);

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
  const session = alert.sessionId ? ` · session \`${alert.sessionId}\`` : "";
  return `${slackHeader(alert)}\n${alert.message}\n_${alert.source} · ${alert.code}${session}_`;
}

function slackHeader(alert: GatewayAlert): string {
  switch (alert.severity) {
    case GatewayAlertSeverity.Down:
      return ":rotating_light: *WhatsApp: athletes' messages may not be reaching the coach*";
    case GatewayAlertSeverity.NeedsHuman:
      return ":sos: *WhatsApp: athletes' messages are not reaching the coach, action needed*";
    case GatewayAlertSeverity.Recovered:
      return ":white_check_mark: *WhatsApp: the session is back*";
  }
}
