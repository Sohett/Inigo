import { z } from "zod";
import { json, requireAdmin } from "../../../../../../src/admin/guard";
import { getDeps } from "../../../../../../src/deps";
import {
  createStartAthleteSession,
  StartSessionFailure
} from "../../../../../../src/use-cases/startAthleteSession";

// Admin actions are always dynamic and must never be cached.
export const dynamic = "force-dynamic";
// Creating a session is a single POST to Anthropic; keep a small ceiling.
export const maxDuration = 30;

const athleteIdSchema = z.uuid();

/** Business failures map to a status the UI can tell apart; infra failures are 502. */
const FAILURE_STATUS: Record<StartSessionFailure, number> = {
  [StartSessionFailure.AthleteNotFound]: 404,
  [StartSessionFailure.BrainNotConfigured]: 409
};

export async function POST(
  request: Request,
  context: { params: Promise<{ athleteId: string }> }
): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { athleteId } = await context.params;
  const parsed = athleteIdSchema.safeParse(athleteId);
  if (!parsed.success) return json({ ok: false, error: "invalid_athlete_id" }, 400);

  const deps = getDeps();
  const startAthleteSession = createStartAthleteSession({
    repo: deps.repo,
    brainConfig: deps.brainConfig,
    brain: deps.brain
  });

  try {
    const outcome = await startAthleteSession.execute(parsed.data);
    if (outcome.status === "failed") {
      return json({ ok: false, error: outcome.reason }, FAILURE_STATUS[outcome.reason]);
    }
    console.info(
      `[coach] new session athlete=${outcome.athleteId} session=${outcome.sessionId} agentVersion=${outcome.agentVersion}`
    );
    return json({
      ok: true,
      sessionId: outcome.sessionId,
      agentVersion: outcome.agentVersion,
      previousSessionId: outcome.previousSessionId
    }, 200);
  } catch (error) {
    console.error("[coach] failed to start a session", error);
    return json({ ok: false, error: "session_start_failed" }, 502);
  }
}
