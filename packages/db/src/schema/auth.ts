import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import type { AuthRole } from "./types";

/**
 * Better Auth's tables (INI-85): who can sign in to the coach app, and their sessions.
 *
 * The shape is Better Auth's (its core `user`, `session`, `account` and `verification` models,
 * mapped onto these tables by its Drizzle adapter); only the names and `role` are ours. Prefixed
 * `auth_` so they never read as coaching data, and so `auth_session` is never mistaken for
 * `athlete_session` (a Managed Agent session).
 *
 * Two kinds of users, told apart by `role`:
 * - `athlete`: created on the first magic link sent on WhatsApp, with a synthetic email derived
 *   from `athlete.id` (an athlete has no email);
 * - `coach`: signs in with Google, only once invited (`coach_invitation`).
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
    ...timestamps()
  },
  (t) => [check("auth_user_role_check", sql`${t.role} in ('athlete', 'coach')`)]
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

/** How a user signs in: the Google account of a coach. Athletes have none (magic link only). */
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
 * Who may become a coach (INI-85). The admin is invitation only: a Google account whose email
 * is not here is refused when Better Auth tries to create its user. Removing a coach removes
 * their invitation and their user, so they can neither stay signed in nor sign up again.
 */
export const coachInvitation = pgTable(
  "coach_invitation",
  {
    /** Lower-cased, as Better Auth stores user emails. */
    email: text("email").primaryKey(),
    /** The coach who sent it; null for the first coach, seeded by the migration. */
    invitedBy: text("invited_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [check("coach_invitation_email_lowercase_check", sql`${t.email} = lower(${t.email})`)]
);
