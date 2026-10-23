import { z } from "zod";
import { json, requireAdmin } from "../../../../src/admin/guard";
import { staffOnDeployment } from "../../../../src/identity/accounts";
import { StaffRole } from "../../../../src/domain/staff";
import { createInviteStaffMember } from "../../../../src/use-cases/inviteStaffMember";
import { createRemoveStaffMember } from "../../../../src/use-cases/removeStaffMember";

// Admin actions are always dynamic and must never be cached.
export const dynamic = "force-dynamic";

const emailSchema = z.object({ email: z.email() });
const inviteSchema = emailSchema.extend({
  roles: z.array(z.enum(StaffRole)).min(1)
});

async function readBody<T>(request: Request, schema: z.ZodType<T>, invalid: string): Promise<T | Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : json({ ok: false, error: invalid }, 400);
}

/**
 * Invite someone to the backoffice (INI-85, INI-87), as admin, coach or both: their user is
 * created, and they sign in with the Google account of this email.
 */
export async function POST(request: Request): Promise<Response> {
  const { staff, denied } = await requireAdmin(request);
  if (denied) return denied;
  const body = await readBody(request, inviteSchema, "invalid_invitation");
  if (body instanceof Response) return body;

  try {
    const team = staffOnDeployment(request.headers);
    if (!team) return json({ ok: false, error: "admin_not_configured" }, 503);
    const outcome = await createInviteStaffMember({ staff: team }).execute(body.email, body.roles, staff.email);
    switch (outcome.status) {
      case "invited":
        console.info("[coach] staff member invited");
        return json({ ok: true }, 200);
      case "already_member":
        return json({ ok: false, error: "already_member" }, 409);
      case "no_role":
        return json({ ok: false, error: "invalid_invitation" }, 400);
    }
  } catch (error) {
    console.error("[coach] failed to invite a staff member", error);
    return json({ ok: false, error: "staff_invite_failed" }, 502);
  }
}

/** Take the backoffice away from a member, or withdraw their invitation. Never one's own. */
export async function DELETE(request: Request): Promise<Response> {
  const { staff, denied } = await requireAdmin(request);
  if (denied) return denied;
  const body = await readBody(request, emailSchema, "invalid_email");
  if (body instanceof Response) return body;

  try {
    const team = staffOnDeployment(request.headers);
    if (!team) return json({ ok: false, error: "admin_not_configured" }, 503);
    const outcome = await createRemoveStaffMember({ staff: team }).execute(body.email, staff.email);
    switch (outcome.status) {
      case "removed":
        console.info("[coach] staff member removed");
        return json({ ok: true }, 200);
      case "not_member":
        return json({ ok: false, error: "not_member" }, 404);
      case "cannot_remove_yourself":
        return json({ ok: false, error: "cannot_remove_yourself" }, 409);
    }
  } catch (error) {
    console.error("[coach] failed to remove a staff member", error);
    return json({ ok: false, error: "staff_remove_failed" }, 502);
  }
}
