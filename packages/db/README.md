# @inigo/db

Shared Neon Postgres schema, Drizzle client, and secret helpers for Inigo. Single
owner of the coaching database schema and its migrations. Consumers (`coach` today,
`athlete-mcp` next) import from here; they never redefine tables.

## What lives here vs. Intervals.icu

The DB owns the **coaching layer**: athlete identity/routing, encrypted secrets,
profile (physiology + historised thresholds), goals, the macro-plan (`training_plan`
→ `plan_block` with weekly targets), weekly propositions (the gate workflow), and the
append-only `adaptation_log`.

It never duplicates what **Intervals.icu** owns: activities, daily PMC (CTL/ATL/TSB),
power/HR/pace curves, and the planned-session calendar. Those are read live via the
Intervals.icu MCP.

## Usage

```ts
import { createDb, athlete, getIntervalsKey, setIntervalsKey } from "@inigo/db";

const db = createDb(process.env.DATABASE_URL!);
const rows = await db.select().from(athlete).where(eq(athlete.phoneNum, "+32..."));

// Per-athlete secrets are sealed with AES-256-GCM (never stored in plaintext):
await setIntervalsKey(db, { athleteId, apiKey, externalAthleteId }, process.env.DB_ENCRYPTION_KEY!);
const key = await getIntervalsKey(db, athleteId, process.env.DB_ENCRYPTION_KEY!);
```

## Migrations

Schema is TypeScript in `src/schema/`. SQL migrations are generated from it and
committed under `drizzle/`. The generate step needs no database; the apply step needs
`DATABASE_URL`.

```bash
pnpm --filter @inigo/db run db:generate   # edit schema -> regenerate SQL (commit it)
DATABASE_URL=postgresql://... pnpm --filter @inigo/db run db:migrate   # apply to Neon
```

Never `push` in production: migrations are versioned and applied via `migrate`.

## Env

- `DATABASE_URL` — Neon connection string.
- `DB_ENCRYPTION_KEY` — base64-encoded 32-byte key for secret sealing. Generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
