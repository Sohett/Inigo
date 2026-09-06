import { z } from "zod";
import { json, requireAdmin } from "../../../../../../src/admin/guard";
import { getDeps } from "../../../../../../src/deps";
import {
  createStartAthleteSession,
  StartSessionFailure
} from "../../../../../../src/use-cases/startAthleteSession";

// Admin actions are always dynamic and must never be cached.
export const dynamic = "force-dynamic";
// Reading one session then creating another: two short calls to Anthropic.
export const maxDuration = 30;

const athleteIdSchema = z.uuid();

/** Business failures map to a status the UI can tell apart; infra failures are 502. */
const FAILURE_STATUS: Record<StartSessionFailure, number> = {
  [StartSessionFailure.AthleteNotFound]: 404,
  [StartSessionFailure.NoSessionToClone]: 409,
  [StartSessionFailure.InvalidElements]: 400
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

  // A body is only needed for an athlete's first session; cloning ignores it.
  let elements: unknown;
  const raw = await request.text();
  if (raw.length > 0) {
    try {
      elements = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
  }

  const deps = getDeps();
  const startAthleteSession = createStartAthleteSession({ repo: deps.repo, brain: deps.brain });

  try {
    const outcome = await startAthleteSession.execute(parsed.data, elements);
    if (outcome.status === "failed") {
      return json(
        { ok: false, error: outcome.reason, ...(outcome.issues ? { issues: outcome.issues } : {}) },
        FAILURE_STATUS[outcome.reason]
      );
    }
    console.info(
      `[coach] new session athlete=${outcome.athleteId} session=${outcome.sessionId} agentVersion=${outcome.agentVersion} source=${outcome.source}`
    );
    return json(
      {
        ok: true,
        sessionId: outcome.sessionId,
        agentVersion: outcome.agentVersion,
        previousSessionId: outcome.previousSessionId,
        source: outcome.source
      },
      200
    );
  } catch (error) {
    console.error("[coach] failed to start a session", error);
    return json({ ok: false, error: "session_start_failed" }, 502);
  }
}
