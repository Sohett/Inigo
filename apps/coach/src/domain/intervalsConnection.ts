import type { AthleteStatus } from "./athlete";

/**
 * Connecting an athlete's Intervals.icu account by OAuth (INI-69): what the coach asks for, and
 * what can come out of a connection attempt. Independent of the HTTP and OAuth plumbing.
 */

/** Whether an athlete may connect Intervals.icu: anyone still coached, not one let go or blocked. */
export function canConnectIntervals(status: AthleteStatus): boolean {
  switch (status) {
    case "onboarding":
    case "active":
    case "paused":
      return true;
    case "ended":
    case "blocked":
      return false;
  }
}

/** The last two digits of a WhatsApp number, so the athlete recognises their link without exposing it. */
export function phoneHint(phoneNum: string | null): string | null {
  const digits = phoneNum?.replace(/\D/g, "") ?? "";
  return digits.length >= 2 ? digits.slice(-2) : null;
}

/**
 * The scopes Inigo asks for, from what the coach's Intervals tools actually call:
 * - `ACTIVITY:READ`: activities, intervals, streams, power, HR and pace curves;
 * - `WELLNESS:READ`: wellness and fitness (CTL/ATL/TSB);
 * - `CALENDAR:WRITE`: planned workouts, created, updated and deleted by the plan builder;
 * - `SETTINGS:WRITE`: FTP and zones, body data (sex, birth date, height, weight), gear.
 */
export const INTERVALS_SCOPES = ["ACTIVITY:READ", "WELLNESS:READ", "CALENDAR:WRITE", "SETTINGS:WRITE"] as const;

/**
 * The required scopes the athlete did not grant (Intervals.icu lets them untick some). `WRITE`
 * implies `READ`, so `CALENDAR:WRITE` granted covers `CALENDAR:READ` asked.
 */
export function missingScopes(granted: readonly string[]): string[] {
  const grants = new Set(granted.map((scope) => scope.trim().toUpperCase()));
  return INTERVALS_SCOPES.filter((scope) => {
    if (grants.has(scope)) return false;
    const [area] = scope.split(":");
    return !(scope.endsWith(":READ") && grants.has(`${area}:WRITE`));
  });
}

/** How a connection attempt ended, as the athlete's result page shows it. */
export const ConnectionResult = {
  /** The token is stored: the coach can read and write Intervals.icu. */
  Connected: "connected",
  /** The athlete declined on Intervals.icu. */
  Denied: "denied",
  /** The athlete unticked scopes the coach needs: nothing stored, try again. */
  MissingScopes: "missing_scopes",
  /** The link is past its expiry: ask the coach for a new one. */
  ExpiredLink: "expired_link",
  /** The link or state was tampered with, truncated, or names no athlete. */
  InvalidLink: "invalid_link",
  /**
   * The callback came back to another browser than the one that opened the link (no matching
   * cookie): either the athlete switched browser midway, or someone sent a raw authorize URL.
   */
  SessionMismatch: "session_mismatch",
  /** This Inigo athlete is already connected to another Intervals.icu account: never swapped silently. */
  OtherAccount: "other_account",
  /** OAuth is not configured on this deployment. */
  Unavailable: "unavailable",
  /** Intervals.icu refused or failed the code exchange: try again from the link. */
  Failed: "failed"
} as const;

export type ConnectionResult = (typeof ConnectionResult)[keyof typeof ConnectionResult];

const RESULTS = new Set<string>(Object.values(ConnectionResult));

/** Read a result from a query string value; anything unknown reads as a failure. */
export function parseConnectionResult(value: string | undefined): ConnectionResult {
  return value !== undefined && RESULTS.has(value) ? (value as ConnectionResult) : ConnectionResult.Failed;
}
