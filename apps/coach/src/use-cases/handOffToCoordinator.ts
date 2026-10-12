import type { ManagedAgentBrain } from "../brain/managedAgents";
import type { Athlete } from "../domain/athlete";
import { sessionElementsFrom } from "../mappers/sessionElements";
import type { AthleteRepository } from "../repositories/athleteRepository";
import type { OnboardingSettingsRepository } from "../repositories/onboardingSettingsRepository";
import { sessionTitle } from "./startAthleteSession";

export type HandOffOutcome =
  /** The athlete is `active` and `sessionId`, run by the coordinator, is their live session. */
  | { status: "handed_off"; sessionId: string }
  /** No coordinator set, or the control plane cannot host its session: nothing changed. */
  | { status: "not_configured"; reason: string };

export interface HandOffToCoordinator {
  execute(athlete: Athlete): Promise<HandOffOutcome>;
}

/**
 * Hand an athlete whose onboarding is complete over to the coordinator (INI-49).
 *
 * The session is created first, then the status and the live session change in one transaction,
 * so a failed create leaves the athlete in onboarding, untouched (at worst an unused session
 * stays at Anthropic). Business outcomes are returned; infrastructure failures throw.
 */
export function createHandOffToCoordinator(deps: {
  repo: Pick<AthleteRepository, "completeOnboarding">;
  settings: Pick<OnboardingSettingsRepository, "get">;
  brain: Pick<ManagedAgentBrain, "listInventory" | "createSession">;
  now?: () => Date;
}): HandOffToCoordinator {
  const now = deps.now ?? (() => new Date());

  return {
    async execute(athlete: Athlete): Promise<HandOffOutcome> {
      const { coordinatorAgentId } = await deps.settings.get();
      if (!coordinatorAgentId) return { status: "not_configured", reason: "no coordinator agent set" };

      const elements = sessionElementsFrom(await deps.brain.listInventory(), coordinatorAgentId);
      if (typeof elements === "string") return { status: "not_configured", reason: elements };

      const created = await deps.brain.createSession({ ...elements, title: sessionTitle(athlete, now()) });
      await deps.repo.completeOnboarding(athlete.id, created.sessionId, coordinatorAgentId);
      return { status: "handed_off", sessionId: created.sessionId };
    }
  };
}
