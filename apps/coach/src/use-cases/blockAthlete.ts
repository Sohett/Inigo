/** The slice of the athlete-data repository this use-case needs (scoped per athlete). */
export interface AthleteBlockerRepository {
  forAthlete(athleteId: string): { block(): Promise<boolean> };
}

export const BlockStatus = {
  Blocked: "blocked",
  NotFound: "not_found"
} as const;

export type BlockOutcome = { status: typeof BlockStatus.Blocked } | { status: typeof BlockStatus.NotFound };

export interface BlockAthlete {
  execute(athleteId: string, reason: string): Promise<BlockOutcome>;
}

/**
 * Block an athlete the coach caught hijacking it (prompt injection, jailbreak, suspicious link) or
 * asking for something unrelated to coaching (INI-66). The agent sends its closing message first:
 * once blocked, routing forwards none of the athlete's messages. There is no column for the reason,
 * it goes to the logs for the operator; unblocking is a manual status change for now.
 */
export function createBlockAthlete(deps: { repo: AthleteBlockerRepository }): BlockAthlete {
  return {
    async execute(athleteId: string, reason: string): Promise<BlockOutcome> {
      const blocked = await deps.repo.forAthlete(athleteId).block();
      if (!blocked) return { status: BlockStatus.NotFound };
      console.warn(`[coach] athlete ${athleteId} blocked: ${reason}`);
      return { status: BlockStatus.Blocked };
    }
  };
}
