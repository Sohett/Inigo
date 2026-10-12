import type { ManagedAgentBrain } from "../brain/managedAgents";
import { formatTurn } from "../brain/taskEnvelope";
import type { BrainInventory, SessionElements } from "../domain/brain";
import type { AthleteRepository } from "../repositories/athleteRepository";
import type { OnboardingSettingsRepository } from "../repositories/onboardingSettingsRepository";
import { sessionTitle } from "./startAthleteSession";

/** Port: answer a WhatsApp chat directly, before any athlete exists. */
export interface ChatReplier {
  replyToChat(chatId: string, text: string): Promise<void>;
}

/** The fixed answer to an unknown number without the access code (INI-42). No agent, no LLM. */
export const NO_ACCESS_CODE_REPLY =
  "Salut ! Ici Inigo, ton futur coach vélo. Pour l'instant l'accès se fait sur invitation : " +
  "si tu as reçu un code, envoie-le moi dans un message et on démarre.";

/** A first message from a number no athlete carries. */
export interface UnknownSender {
  phoneNum: string | null;
  whatsappLid: string | null;
  chatId: string;
  text: string;
}

export type RegisterOutcome =
  | { status: "registered"; athleteId: string; sessionId: string }
  /** No access code in the message: the fixed answer was sent. */
  | { status: "declined" }
  /** No onboarding agent or no access code set in the admin: unknown numbers stay ignored. */
  | { status: "disabled" }
  /** Another first message of the same sender won the race and registered them. */
  | { status: "already_registered" }
  /** The control plane cannot host the session as configured; `reason` says what to fix. */
  | { status: "misconfigured"; reason: string };

export interface RegisterNewAthlete {
  execute(sender: UnknownSender): Promise<RegisterOutcome>;
}

/** Whether the message carries the access code, whatever its case or surrounding text. */
export function carriesAccessCode(text: string, accessCode: string): boolean {
  return text.toLowerCase().includes(accessCode.trim().toLowerCase());
}

/**
 * What the onboarding session runs on: the configured agent, and the one environment and vault
 * of the workspace. With none or several, guessing would be worse than refusing. Returns the
 * reason to fix instead when the inventory does not allow it.
 */
export function onboardingSessionElements(
  inventory: BrainInventory,
  agentId: string
): SessionElements | string {
  if (!inventory.agents.some((agent) => agent.id === agentId)) {
    return `onboarding agent ${agentId} does not exist in the workspace`;
  }
  const [environment, ...otherEnvironments] = inventory.environments;
  if (!environment || otherEnvironments.length > 0) {
    return `expected exactly one environment, found ${inventory.environments.length}`;
  }
  const [vault, ...otherVaults] = inventory.vaults;
  if (!vault || otherVaults.length > 0) {
    return `expected exactly one vault, found ${inventory.vaults.length}`;
  }
  return { agentId, environmentId: environment.id, vaultIds: [vault.id], resources: [] };
}

/**
 * Turn an unknown number into an athlete in onboarding, if it sent the access code (INI-45).
 *
 * The session is created first and the athlete is written with it in one transaction, so a
 * failed create never leaves an athlete with nothing to route to (at worst an unused session
 * stays at Anthropic). The first message is forwarded last. Business outcomes are returned;
 * infrastructure failures (DB, Anthropic, gateway) throw.
 */
export function createRegisterNewAthlete(deps: {
  repo: Pick<AthleteRepository, "registerOnboardingAthlete">;
  settings: Pick<OnboardingSettingsRepository, "get">;
  brain: Pick<ManagedAgentBrain, "listInventory" | "createSession" | "appendUserMessage">;
  replier: ChatReplier;
  now?: () => Date;
}): RegisterNewAthlete {
  const now = deps.now ?? (() => new Date());

  return {
    async execute(sender: UnknownSender): Promise<RegisterOutcome> {
      const { onboardingAgentId, accessCode } = await deps.settings.get();
      if (!onboardingAgentId || !accessCode) return { status: "disabled" };

      if (!carriesAccessCode(sender.text, accessCode)) {
        await deps.replier.replyToChat(sender.chatId, NO_ACCESS_CODE_REPLY);
        return { status: "declined" };
      }

      const elements = onboardingSessionElements(await deps.brain.listInventory(), onboardingAgentId);
      if (typeof elements === "string") return { status: "misconfigured", reason: elements };

      const created = await deps.brain.createSession({
        ...elements,
        title: sessionTitle({ displayName: null, ...sender }, now())
      });
      const athlete = await deps.repo.registerOnboardingAthlete({
        phoneNum: sender.phoneNum,
        whatsappLid: sender.whatsappLid,
        chatId: sender.chatId,
        session: { sessionId: created.sessionId, agentId: onboardingAgentId }
      });
      if (!athlete) return { status: "already_registered" };

      await deps.brain.appendUserMessage(created.sessionId, formatTurn(athlete.id, sender.text));
      return { status: "registered", athleteId: athlete.id, sessionId: created.sessionId };
    }
  };
}
