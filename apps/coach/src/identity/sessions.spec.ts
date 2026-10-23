import { describe, expect, it } from "vitest";
import { SignInState } from "../domain/signedIn";
import { athleteEmail } from "./athleteEmail";
import type { InigoAuth } from "./betterAuth";
import { whoIsSignedIn } from "./sessions";

const ATHLETE_ID = "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f";

/** An auth whose session belongs to this user: the mapping is ours, the session Better Auth's. */
const authWith = (user: { email: string; name: string; role: string; athleteId?: string | null }) =>
  ({ api: { getSession: async () => ({ user, session: {} }) } }) as unknown as InigoAuth;

describe("whoIsSignedIn", () => {
  it("reads unavailable when sign in is not configured", async () => {
    expect(await whoIsSignedIn(new Headers(), null)).toEqual({ state: SignInState.Unavailable });
  });

  it("reads signed out without a session", async () => {
    const auth = { api: { getSession: async () => null } } as unknown as InigoAuth;
    expect(await whoIsSignedIn(new Headers(), auth)).toEqual({ state: SignInState.SignedOut });
  });

  it.each(["admin", "coach", "admin,coach"])("reads the role %s as staff", async (role) => {
    const auth = authWith({ email: "staff@example.com", name: "Thomas", role, athleteId: null });
    expect(await whoIsSignedIn(new Headers(), auth)).toEqual({ state: SignInState.Staff, email: "staff@example.com", name: "Thomas" });
  });

  it("reads the athlete from the foreign key, not from the email", async () => {
    const auth = authWith({ email: athleteEmail("11111111-1111-4111-8111-111111111111"), name: "", role: "athlete", athleteId: ATHLETE_ID });
    expect(await whoIsSignedIn(new Headers(), auth)).toEqual({ state: SignInState.Athlete, athleteId: ATHLETE_ID });
  });

  it.each([
    ["an athlete user without an athlete", { email: athleteEmail(ATHLETE_ID), name: "", role: "athlete", athleteId: null }],
    ["an unknown role", { email: "x@example.com", name: "", role: "user" }]
  ])("reads %s as signed out", async (_label, user) => {
    expect(await whoIsSignedIn(new Headers(), authWith(user))).toEqual({ state: SignInState.SignedOut });
  });
});
