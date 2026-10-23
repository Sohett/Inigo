import { describe, expect, it, vi } from "vitest";
import { CoachStatus, type Coach } from "../domain/coach";
import { createInviteCoach } from "./inviteCoach";
import { createListCoaches } from "./listCoaches";
import { createRemoveCoach } from "./removeCoach";

describe("inviteCoach", () => {
  it("invites the email lower-cased and trimmed, recording who invited", async () => {
    const invite = vi.fn(async () => true);
    const outcome = await createInviteCoach({ coaches: { invite } }).execute("  New.Coach@Example.com ", "Sohet.Thomas@gmail.com");
    expect(invite).toHaveBeenCalledWith("new.coach@example.com", "sohet.thomas@gmail.com");
    expect(outcome).toEqual({ status: "invited", email: "new.coach@example.com" });
  });

  it("says when the email was already invited", async () => {
    const outcome = await createInviteCoach({ coaches: { invite: vi.fn(async () => false) } }).execute("a@b.co", "c@d.co");
    expect(outcome.status).toBe("already_invited");
  });
});

describe("removeCoach", () => {
  it("removes another coach", async () => {
    const remove = vi.fn(async () => true);
    expect(await createRemoveCoach({ coaches: { remove } }).execute("Other@Example.com", "me@example.com")).toEqual({ status: "removed" });
    expect(remove).toHaveBeenCalledWith("other@example.com");
  });

  it("never lets a coach remove themselves, whatever the case", async () => {
    const remove = vi.fn(async () => true);
    expect(await createRemoveCoach({ coaches: { remove } }).execute("ME@example.com", "me@example.com")).toEqual({
      status: "cannot_remove_yourself"
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("says when the email was not invited", async () => {
    expect(await createRemoveCoach({ coaches: { remove: vi.fn(async () => false) } }).execute("x@y.co", "me@example.com")).toEqual({
      status: "not_invited"
    });
  });
});

describe("listCoaches", () => {
  it("returns the team as the repository reads it", async () => {
    const team: Coach[] = [
      { email: "sohet.thomas@gmail.com", status: CoachStatus.Active, name: "Thomas", invitedBy: null, invitedAt: new Date("2026-10-23") }
    ];
    expect(await createListCoaches({ coaches: { list: vi.fn(async () => team) } }).execute()).toBe(team);
  });
});
