import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authUser, createDb, staffMember, type Db } from "@inigo/db";
import { StaffStatus } from "../domain/staff";
import { createDrizzleStaffRepository } from "./drizzleStaffRepository";

/**
 * Live round-trip of the backoffice team (INI-85) against a real Neon branch: the membership,
 * its CHECKs (roles, lower-cased email), the status read through `auth_user`, and the removal
 * batch. Skipped unless DATABASE_URL is set, so `pnpm verify` stays offline and green in CI.
 * Provisions and tears down its own rows, on emails no real member can have.
 *
 * Run it with:
 *   DATABASE_URL=postgres://... pnpm --filter @inigo/coach test
 */
const databaseUrl = process.env.DATABASE_URL;
const INVITED = "staff-integration-invited@example.com";
const ACTIVE = "staff-integration-active@example.com";
const EMAILS = [INVITED, ACTIVE];

describe.skipIf(!databaseUrl)("drizzleStaffRepository (integration)", () => {
  let db: Db;

  async function cleanUp() {
    await db.delete(authUser).where(inArray(authUser.email, EMAILS));
    await db.delete(staffMember).where(inArray(staffMember.email, EMAILS));
  }

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await cleanUp();
  });

  afterAll(async () => {
    if (db) await cleanUp();
  });

  it("invites once, with its roles", async () => {
    const staff = createDrizzleStaffRepository(db);
    expect(await staff.invite(INVITED, ["coach"], "sohet.thomas@gmail.com")).toBe(true);
    expect(await staff.invite(INVITED, ["admin"], "sohet.thomas@gmail.com")).toBe(false);
    expect(await staff.isMember(INVITED)).toBe(true);
    const member = (await staff.list()).find((entry) => entry.email === INVITED);
    expect(member).toMatchObject({ roles: ["coach"], status: StaffStatus.Invited, name: null, invitedBy: "sohet.thomas@gmail.com" });
  });

  it("refuses a member without a role, with an unknown role, or with an upper-cased email", async () => {
    await expect(db.insert(staffMember).values({ email: ACTIVE, roles: [] })).rejects.toThrow();
    await expect(db.insert(staffMember).values({ email: ACTIVE, roles: ["owner" as "admin"] })).rejects.toThrow();
    await expect(db.insert(staffMember).values({ email: ACTIVE.toUpperCase(), roles: ["admin"] })).rejects.toThrow();
  });

  it("reads a member with a staff user as active, and removes both in one batch", async () => {
    const staff = createDrizzleStaffRepository(db);
    await staff.invite(ACTIVE, ["admin", "coach"], "sohet.thomas@gmail.com");
    await db.insert(authUser).values({ id: "staff-integration-user", name: "Active", email: ACTIVE, emailVerified: true, role: "staff" });

    const member = (await staff.list()).find((entry) => entry.email === ACTIVE);
    expect(member).toMatchObject({ roles: ["admin", "coach"], status: StaffStatus.Active, name: "Active" });

    expect(await staff.remove(ACTIVE)).toBe(true);
    expect(await staff.isMember(ACTIVE)).toBe(false);
    expect(await db.select().from(authUser).where(eq(authUser.email, ACTIVE))).toEqual([]);
    expect(await staff.remove(ACTIVE)).toBe(false);
  });

  it("refuses an athlete user tied to no athlete", async () => {
    await expect(
      db.insert(authUser).values({ id: "staff-integration-bad", name: "", email: ACTIVE, emailVerified: true, role: "athlete" })
    ).rejects.toThrow();
  });
});
