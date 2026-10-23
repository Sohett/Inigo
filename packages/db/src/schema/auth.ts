import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { timestamps } from "./columns";
import type { AuthRole } from "./types";

/**
 * Who can sign in to the coach app, and their sessions (INI-85, INI-87).
 *
 * Better Auth's tables: its core `user`, `session`, `account` and `verification` models plus its
 * `admin` plugin's columns (`role`, `banned`, `ban_reason`, `ban_expires`, `impersonated_by`),
 * mapped onto these tables by its Drizzle adapter. `athlete_id` and `invited_by` are ours.
 * Prefixed `auth_` so they never read as coaching data, and so `auth_session` is never mistaken
 * for `athlete_session` (a Managed Agent session).
 *
 * **A user is never created by signing in.** Our use-cases create them with the admin plugin
 * (`createAthleteLink`, `inviteStaffMember`); signing in only authenticates an existing user:
 * - `role = 'athlete'`: tied to their athlete by `athlete_id`, signs in with the magic link sent
 *   on WhatsApp. Their email is synthetic (Better Auth requires one, an athlete has none);
 * - `role` `admin`, `coach` or `admin,coach`: the backoffice staff, invited by email. Their Google
 *   account is linked to this user on their first sign in, which also verifies their email:
 *   `email_verified` false means still invited.
 */
export const authUser = pgTable(
  "auth_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").$type<AuthRole>().notNull(),
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    /** The athlete this user is: set for an athlete, null for staff. Deleting the athlete deletes their user. */
    athleteId: uuid("athlete_id")
      .unique()
      .references(() => athlete.id, { onDelete: "cascade" }),
    /** The staff member who invited this one; null for the first, and for athletes. */
    invitedBy: text("invited_by"),
    ...timestamps()
  },
  (t) => [
    check("auth_user_role_check", sql`${t.role} in ('athlete', 'admin', 'coach', 'admin,coach')`),
    check("auth_user_athlete_check", sql`(${t.role} = 'athlete') = (${t.athleteId} is not null)`),
    check("auth_user_email_lowercase_check", sql`${t.email} = lower(${t.email})`)
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
    /** Better Auth's admin plugin; impersonation is disabled, so always null. */
    impersonatedBy: text("impersonated_by"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    ...timestamps()
  },
  (t) => [index("auth_session_user_id_idx").on(t.userId)]
);

/**
 * How a user signs in: the Google account of a staff member, linked by Better Auth to their
 * existing user on their first sign in. Athletes have none (magic link only).
 */
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
