import { getDeps } from "../../../../src/deps";
import { verifyWebhookSignature, OPENWA_SIGNATURE_HEADER } from "../../../../src/auth";
import { createRouteInboundMessage, RouteStatus, type RouteOutcome } from "../../../../src/use-cases/routeInboundMessage";
import { createRegisterNewAthlete, RegisterStatus, type RegisterOutcome } from "../../../../src/use-cases/registerNewAthlete";
import { createOpenWaChatReplier } from "../../../../src/whatsapp/chatReplier";
import { createAssessOnboarding } from "../../../../src/use-cases/assessOnboarding";
import { createHandOffToCoordinator } from "../../../../src/use-cases/handOffToCoordinator";
import { createRefreshAthleteSession } from "../../../../src/use-cases/refreshAthleteSession";
import { createDrizzleOnboardingFactsReader } from "../../../../src/repositories/drizzleOnboardingFactsReader";
import { createIntervalsAthleteReader } from "../../../../src/intervals/intervalsAthleteReader";
import { createHandleGatewaySessionEvent } from "../../../../src/use-cases/handleGatewaySessionEvent";
import { isGatewaySessionEvent } from "../../../../src/mappers/whatsappPayload";

// Webhook deliveries are dynamic and must never be cached.
export const dynamic = "force-dynamic";
// Appending one event to a session is a single fast POST; keep a small ceiling.
export const maxDuration = 30;

/** One log line per delivery, saying what happened to it. */
function logOutcome(outcome: RouteOutcome): void {
  switch (outcome.status) {
    case RouteStatus.Forwarded:
      console.info(
        `[coach] forwarded athlete=${outcome.athleteId} session=${outcome.sessionId} chat=${outcome.chatId}`
      );
      return;
    case RouteStatus.HandedOff:
      console.info(
        `[coach] handed off athlete=${outcome.athleteId} to coordinator session=${outcome.sessionId} chat=${outcome.chatId}`
      );
      return;
    case RouteStatus.HandoffNotConfigured:
      console.warn(
        `[coach] onboarding complete but no hand-off for athlete=${outcome.athleteId} (${outcome.reason}): ` +
          `forwarded to session=${outcome.sessionId}`
      );
      return;
    case RouteStatus.UnknownSender:
      logRegistration(outcome.registration);
      return;
    case RouteStatus.SenderConflict:
      console.error(
        `[coach] sender conflicts with athlete records (${outcome.athleteIds.join(", ")}): nothing forwarded, fix the records`
      );
      return;
    case RouteStatus.Ignored:
      console.info(`[coach] ignored delivery: ${outcome.reason}`);
      return;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled route outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** What happened to a sender no athlete carries. A misconfiguration is for the operator to fix. */
function logRegistration(registration: RegisterOutcome): void {
  switch (registration.status) {
    case RegisterStatus.Misconfigured:
      console.error(`[coach] onboarding misconfigured: ${registration.reason}`);
      return;
    case RegisterStatus.Registered:
      console.info(`[coach] registered athlete=${registration.athleteId} session=${registration.sessionId}`);
      return;
    case RegisterStatus.Declined:
    case RegisterStatus.Disabled:
    case RegisterStatus.AlreadyRegistered:
      console.info(`[coach] unknown sender: ${registration.status}`);
      return;
    default: {
      const unhandled: never = registration;
      throw new Error(`Unhandled registration outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const deps = getDeps();

  // Every delivery is signed by OpenWA: the webhook is the only proof of who an athlete is.
  const signature = request.headers.get(OPENWA_SIGNATURE_HEADER);
  if (!verifyWebhookSignature(rawBody, signature, deps.config.WHATSAPP_WEBHOOK_SECRET)) {
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = rawBody.length > 0 ? JSON.parse(rawBody) : null;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // Session lifecycle events (INI-40) raise an alert and never fail: the alerter swallows its
  // own errors, so a Slack outage cannot make BullMQ replay the event into a second alert.
  if (isGatewaySessionEvent(payload)) {
    const outcome = await createHandleGatewaySessionEvent({
      alerter: deps.alerter,
      gateway: deps.whatsappGateway
    }).execute(payload);
    console.info(`[coach] session event: ${JSON.stringify(outcome)}`);
    return json({ ok: true }, 200);
  }

  try {
    const register = createRegisterNewAthlete({
      repo: deps.repo,
      settings: deps.onboardingSettings,
      brain: deps.brain,
      replier: createOpenWaChatReplier({ gateway: deps.whatsappGateway, resolveClient: deps.whatsapp })
    });
    const assessOnboarding = createAssessOnboarding({
      facts: createDrizzleOnboardingFactsReader(deps.db),
      intervals: createIntervalsAthleteReader(deps.intervalsResolver)
    });
    const routeInboundMessage = createRouteInboundMessage({
      repo: deps.repo,
      brain: deps.brain,
      register,
      assessOnboarding,
      handOff: createHandOffToCoordinator({ repo: deps.repo, settings: deps.onboardingSettings, brain: deps.brain }),
      turnSession: createRefreshAthleteSession({ repo: deps.repo, brain: deps.brain })
    });
    logOutcome(await routeInboundMessage.execute(payload));
  } catch (error) {
    console.error("[coach] failed to forward inbound message", error);
    return json({ ok: false, error: "forward_failed" }, 502);
  }

  return json({ ok: true }, 200);
}
