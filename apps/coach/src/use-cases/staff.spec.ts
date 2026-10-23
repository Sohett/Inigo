import { describe, expect, it, vi } from "vitest";
import { StaffStatus, type StaffMember } from "../domain/staff";
import { createInviteStaffMember } from "./inviteStaffMember";
import { createListStaff } from "./listStaff";
import { createRemoveStaffMember } from "./removeStaffMember";

describe("inviteStaffMember", () => {
  it("invites the email lower-cased and trimmed, with its roles, recording who invited", async () => {
    const invite = vi.fn(async () => true);
    const outcome = await createInviteStaffMember({ staff: { invite } }).execute(
      "  New.Coach@Example.com ",
      ["coach"],
      "Sohet.Thomas@gmail.com"
    );
    expect(invite).toHaveBeenCalledWith("new.coach@example.com", ["coach"], "sohet.thomas@gmail.com");
    expect(outcome).toEqual({ status: "invited", email: "new.coach@example.com" });
  });

  it("keeps each role once, in a stable order", async () => {
    const invite = vi.fn(async () => true);
    await createInviteStaffMember({ staff: { invite } }).execute("a@b.co", ["coach", "admin", "coach"], "c@d.co");
    expect(invite).toHaveBeenCalledWith("a@b.co", ["admin", "coach"], "c@d.co");
  });

  it("refuses a member without a role, inviting nothing", async () => {
    const invite = vi.fn(async () => true);
    expect(await createInviteStaffMember({ staff: { invite } }).execute("a@b.co", [], "c@d.co")).toEqual({ status: "no_role" });
    expect(invite).not.toHaveBeenCalled();
  });

  it("says when the email already is a member", async () => {
    const outcome = await createInviteStaffMember({ staff: { invite: vi.fn(async () => false) } }).execute("a@b.co", ["admin"], "c@d.co");
    expect(outcome.status).toBe("already_member");
  });
});

describe("removeStaffMember", () => {
  it("removes another member", async () => {
    const remove = vi.fn(async () => true);
    expect(await createRemoveStaffMember({ staff: { remove } }).execute("Other@Example.com", "me@example.com")).toEqual({ status: "removed" });
    expect(remove).toHaveBeenCalledWith("other@example.com");
  });

  it("never lets a member remove themselves, whatever the case", async () => {
    const remove = vi.fn(async () => true);
    expect(await createRemoveStaffMember({ staff: { remove } }).execute("ME@example.com", "me@example.com")).toEqual({
      status: "cannot_remove_yourself"
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("says when the email was not a member", async () => {
    expect(await createRemoveStaffMember({ staff: { remove: vi.fn(async () => false) } }).execute("x@y.co", "me@example.com")).toEqual({
      status: "not_member"
    });
  });
});

describe("listStaff", () => {
  it("returns the team as the repository reads it", async () => {
    const team: StaffMember[] = [
      {
        email: "sohet.thomas@gmail.com",
        roles: ["admin", "coach"],
        status: StaffStatus.Active,
        name: "Thomas",
        invitedBy: null,
        invitedAt: new Date("2026-10-23")
      }
    ];
    expect(await createListStaff({ staff: { list: vi.fn(async () => team) } }).execute()).toBe(team);
  });
});
