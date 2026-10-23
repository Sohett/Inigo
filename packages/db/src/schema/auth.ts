import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { timestamps } from "./columns";
import type { AuthRole, StaffRole } from "./types";

/**
 * Better Auth's tables (INI-85): who can sign in to the coach app, and their sessions.
 *
 * The shape is Better Auth's (its core `user`, `session`, `account` and `verification` models,
 * mapped onto these tables by its Drizzle adapter); only the names, `role` and `athlete_id` are ours. Prefixed
 * `auth_` so they never read as coaching data, and so `auth_session` is never mistaken for
 * `athlete_session` (a Managed Agent session).
 *
 * Two kinds of users, told apart by `role`:
 * - `athlete`: created on the first magic link sent on WhatsApp, tied to their `athlete` row by
 *   `athlete_id`. Their email is synthetic (derived from `athlete.id`): Better Auth requires one,
 *   and an athlete has none;
 * - `staff`: signs in to the backoffice with Google, only once invited (`staff_member`).
 */
export const authUser = pgTable(
  "auth_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    /** Set by the server when the user is created, never by a request. */
    role: text("role").$type<AuthRole>().notNull(),
    /** The athlete this user is; set for an athlete, null for staff. Deleting the athlete deletes their user. */
    athleteId: uuid("athlete_id")
      .unique()
      .references(() => athlete.id, { onDelete: "cascade" }),
    ...timestamps()
  },
  (t) => [
    check("auth_user_role_check", sql`${t.role} in ('athlete', 'staff')`),
    check("auth_user_athlete_check", sql`(${t.role} = 'athlete') = (${t.athleteId} is not null)`)
  ]
);

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    ...timestamps()
  },
  (t) => [index("auth_session_user_id_idx").on(t.userId)]
);

/** How a user signs in: the Google account of a staff member. Athletes have none (magic link only). */
export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps()
  },
  (t) => [index("auth_account_user_id_idx").on(t.userId)]
);

/** Pending magic links (hashed token, 1 hour) and Google sign-in states. Consumed once. */
export const authVerification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps()
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)]
);

/**
 * The backoffice team (INI-85): who may sign in with Google, and as what. Invitation only: a
 * Google account whose email is not here is refused when Better Auth tries to create its user.
 * A member is invited until their first sign in (no `auth_user` yet), then active. Removing a
 * member removes this row and their user, so they can neither stay signed in nor sign up again.
 */
export const staffMember = pgTable(
  "staff_member",
  {
    /** Lower-cased, as Better Auth stores user emails. */
    email: text("email").primaryKey(),
    /** `admin`, `coach`, or both; at least one. */
    roles: text("roles").array().$type<StaffRole[]>().notNull(),
    /** The member who invited them; null for the first one, seeded by the migration. */
    invitedBy: text("invited_by"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check("staff_member_email_lowercase_check", sql`${t.email} = lower(${t.email})`),
    check(
      "staff_member_roles_check",
      sql`cardinality(${t.roles}) > 0 and ${t.roles} <@ array['admin', 'coach']::text[]`
    )
  ]
);
