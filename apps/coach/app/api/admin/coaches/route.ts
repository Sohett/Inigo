import { z } from "zod";
import { json, requireAdmin } from "../../../../src/admin/guard";
import { getDeps } from "../../../../src/deps";
import { createInviteCoach } from "../../../../src/use-cases/inviteCoach";
import { createRemoveCoach } from "../../../../src/use-cases/removeCoach";

// Admin actions are always dynamic and must never be cached.
export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.email() });

async function readEmail(request: Request): Promise<string | Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const parsed = bodySchema.safeParse(payload);
  return parsed.success ? parsed.data.email : json({ ok: false, error: "invalid_email" }, 400);
}

/** Invite a coach to the admin (INI-85): they sign in with the Google account of this email. */
export async function POST(request: Request): Promise<Response> {
  const { coach, denied } = await requireAdmin(request);
  if (denied) return denied;
  const email = await readEmail(request);
  if (email instanceof Response) return email;

  try {
    const outcome = await createInviteCoach({ coaches: getDeps().coaches }).execute(email, coach.email);
    switch (outcome.status) {
      case "invited":
        console.info("[coach] coach invited");
        return json({ ok: true }, 200);
      case "already_invited":
        return json({ ok: false, error: "already_invited" }, 409);
    }
  } catch (error) {
    console.error("[coach] failed to invite a coach", error);
    return json({ ok: false, error: "coach_invite_failed" }, 502);
  }
}

/** Take the admin away from a coach, or withdraw their invitation. Never one's own. */
export async function DELETE(request: Request): Promise<Response> {
  const { coach, denied } = await requireAdmin(request);
  if (denied) return denied;
  const email = await readEmail(request);
  if (email instanceof Response) return email;

  try {
    const outcome = await createRemoveCoach({ coaches: getDeps().coaches }).execute(email, coach.email);
    switch (outcome.status) {
      case "removed":
        console.info("[coach] coach removed");
        return json({ ok: true }, 200);
      case "not_invited":
        return json({ ok: false, error: "not_invited" }, 404);
      case "cannot_remove_yourself":
        return json({ ok: false, error: "cannot_remove_yourself" }, 409);
    }
  } catch (error) {
    console.error("[coach] failed to remove a coach", error);
    return json({ ok: false, error: "coach_remove_failed" }, 502);
  }
}
