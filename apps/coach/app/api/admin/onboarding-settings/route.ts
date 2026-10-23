import { z } from "zod";
import { json, requireAdmin } from "../../../../src/admin/guard";
import { getDeps } from "../../../../src/deps";

// Admin actions are always dynamic and must never be cached.
export const dynamic = "force-dynamic";

/** An empty field clears the setting: onboarding then stays off until it is set again. */
const optional = (field: z.ZodString) =>
  z.union([z.literal("").transform(() => null), field, z.null()]);

const agentId = z.string().trim().startsWith("agent_", "must start with agent_").max(200);

const bodySchema = z.object({
  onboardingAgentId: optional(agentId),
  coordinatorAgentId: optional(agentId),
  accessCode: optional(z.string().trim().min(4).max(64))
});

/**
 * Record the onboarding settings: the agent that onboards a new athlete, the coordinator it
 * hands them to, and the access code. In the database with a form in front of it, like the
 * WhatsApp session, because they change too often for the environment.
 */
export async function POST(request: Request): Promise<Response> {
  const { denied } = await requireAdmin(request);
  if (denied) return denied;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return json({ ok: false, error: "invalid_onboarding_settings" }, 400);

  try {
    await getDeps().onboardingSettings.set(parsed.data);
    console.info("[coach] onboarding settings updated");
    return json({ ok: true }, 200);
  } catch (error) {
    console.error("[coach] failed to record the onboarding settings", error);
    return json({ ok: false, error: "onboarding_settings_update_failed" }, 502);
  }
}
