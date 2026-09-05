import { json, requireAdmin } from "../../../../src/admin/guard";
import { getDeps } from "../../../../src/deps";
import { createUpdateBrainConfig } from "../../../../src/use-cases/updateBrainConfig";

export const dynamic = "force-dynamic";

export async function PUT(request: Request): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const deps = getDeps();
  const updateBrainConfig = createUpdateBrainConfig({ brainConfig: deps.brainConfig });

  try {
    const outcome = await updateBrainConfig.execute(payload);
    if (outcome.status === "invalid") {
      return json({ ok: false, error: "invalid_input", issues: outcome.issues }, 400);
    }
    console.info(
      `[coach] brain config updated agent=${outcome.template.coordinatorAgentId} env=${outcome.template.environmentId}`
    );
    return json({ ok: true, template: outcome.template }, 200);
  } catch (error) {
    console.error("[coach] failed to update the brain config", error);
    return json({ ok: false, error: "brain_config_update_failed" }, 502);
  }
}
