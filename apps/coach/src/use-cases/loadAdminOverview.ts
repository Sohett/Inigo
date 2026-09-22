import type { ManagedAgentBrain } from "../brain/managedAgents";
import type { Athlete } from "../domain/athlete";
import type { BrainInventory, RunningSession } from "../domain/brain";
import type { AthleteRepository } from "../repositories/athleteRepository";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";

/** One athlete plus what their session actually runs on, when it can be read. */
export interface AthleteOverview {
  athlete: Athlete;
  /** The live session, or null when the athlete has none or it could not be read. */
  session: RunningSession | null;
  /** Why the session could not be read. Null when there was nothing to read, or it worked. */
  sessionError: string | null;
}

export interface AdminOverview {
  athletes: AthleteOverview[];
  /** What exists in the control plane, for opening a first session. Null if unreachable. */
  inventory: BrainInventory | null;
  inventoryError: string | null;
  /** The recorded WhatsApp gateway session. Null when none is set, or it could not be read. */
  whatsappSessionId: string | null;
  whatsappSessionError: string | null;
}

export interface LoadAdminOverviewDeps {
  repo: AthleteRepository;
  brain: ManagedAgentBrain;
  gateway: WhatsappGatewayRepository;
}

export interface LoadAdminOverview {
  execute(): Promise<AdminOverview>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Assemble everything the admin page shows, reading the control plane rather than any
 * stored copy of it.
 *
 * Failures are captured **per athlete** instead of aborting the page: a stale pointer to
 * a deleted session is exactly the kind of drift this page exists to surface, so it must
 * render as a visible problem on that row, not as a 500 that hides every other athlete.
 * Same rule as the snapshot reads in `@inigo/brain`. The inventory is only needed to open
 * a first session, so losing it degrades the page rather than breaking it.
 */
export function createLoadAdminOverview(deps: LoadAdminOverviewDeps): LoadAdminOverview {
  return {
    async execute(): Promise<AdminOverview> {
      const athletes = await deps.repo.listAll();

      const gatewayResult = await deps.gateway.getSessionId().then(
        (sessionId): { sessionId: string | null; error: string | null } => ({ sessionId, error: null }),
        (error: unknown) => ({ sessionId: null, error: messageOf(error) })
      );

      const needsInventory = athletes.some((athlete) => athlete.anthropicSessionId === null);
      const [inventoryResult, ...sessionResults] = await Promise.all([
        needsInventory
          ? deps.brain.listInventory().then(
              (inventory): { inventory: BrainInventory | null; error: string | null } => ({
                inventory,
                error: null
              }),
              (error: unknown) => ({ inventory: null, error: messageOf(error) })
            )
          : Promise.resolve({ inventory: null, error: null }),
        ...athletes.map(
          (athlete): Promise<{ session: RunningSession | null; sessionError: string | null }> => {
            if (!athlete.anthropicSessionId) {
              return Promise.resolve({ session: null, sessionError: null });
            }
            return deps.brain.readSession(athlete.anthropicSessionId).then(
              (session) => ({ session, sessionError: null }),
              (error: unknown) => ({ session: null, sessionError: messageOf(error) })
            );
          }
        )
      ]);

      return {
        athletes: athletes.map((athlete, index) => ({
          athlete,
          session: sessionResults[index]?.session ?? null,
          sessionError: sessionResults[index]?.sessionError ?? null
        })),
        inventory: inventoryResult.inventory,
        inventoryError: inventoryResult.error,
        whatsappSessionId: gatewayResult.sessionId,
        whatsappSessionError: gatewayResult.error
      };
    }
  };
}
