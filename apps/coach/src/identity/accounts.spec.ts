import { describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
import { StaffRole } from "../domain/staff";
import { betterAuthAthleteAccounts, betterAuthStaff } from "./accounts";
import type { InigoAuth } from "./betterAuth";

/**
 * What the memory adapter cannot show (INI-87): the database refusing a concurrent insert, and the
 * admin plugin answering an empty list when the database fails. `auth.api` is stubbed; the real
 * flows are in `betterAuth.spec.ts`.
 */

const ATHLETE = { id: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f", displayName: "Thomas" };
const EXISTS = new APIError("BAD_REQUEST", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "exists" });
const UNIQUE_VIOLATION = new Error('duplicate key value violates unique constraint "auth_user_email_unique"');

const authWith = (api: Record<string, unknown>) => ({ api }) as unknown as InigoAuth;

describe("betterAuthAthleteAccounts.ensure", () => {
  it("is done when the athlete's user exists already", async () => {
    const createUser = vi.fn().mockRejectedValueOnce(EXISTS);
    await betterAuthAthleteAccounts(authWith({ createUser })).ensure(ATHLETE);
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it("survives a concurrent first link: the database refused, and asking again says it exists", async () => {
    const createUser = vi.fn().mockRejectedValueOnce(UNIQUE_VIOLATION).mockRejectedValueOnce(EXISTS);
    await betterAuthAthleteAccounts(authWith({ createUser })).ensure(ATHLETE);
    expect(createUser).toHaveBeenCalledTimes(2);
  });

  it("throws a failure that is not a race", async () => {
    const createUser = vi.fn().mockRejectedValue(new Error("neon down"));
    await expect(betterAuthAthleteAccounts(authWith({ createUser })).ensure(ATHLETE)).rejects.toThrow("neon down");
  });
});

describe("betterAuthStaff during a database outage (the plugin's listUsers answers an empty list)", () => {
  const outage = () => betterAuthStaff(authWith({ listUsers: vi.fn(async () => ({ users: [], total: 0 })) }), new Headers());

  it("fails the team list instead of showing nobody", async () => {
    await expect(outage().list()).rejects.toThrow("did not answer");
  });

  it("fails a removal instead of answering not a member", async () => {
    await expect(outage().remove("coach@example.com")).rejects.toThrow("did not answer");
  });

  it("answers not a member when the database does answer", async () => {
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ users: [], total: 0 })
      .mockResolvedValueOnce({ users: [{ id: "me", email: "me@example.com", role: StaffRole.Admin }], total: 1 });
    expect(await betterAuthStaff(authWith({ listUsers }), new Headers()).remove("gone@example.com")).toBe(false);
  });
});
