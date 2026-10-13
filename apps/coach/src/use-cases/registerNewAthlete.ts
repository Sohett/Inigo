import type { ManagedAgentBrain } from "../brain/managedAgents";
import { formatOnboardingTurn } from "../brain/taskEnvelope";
import { sessionElementsFrom } from "../mappers/sessionElements";
import { NOTHING_DONE } from "../domain/onboarding";
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

/** What happened to a sender no athlete carries. */
export const RegisterStatus = {
  Registered: "registered",
  Declined: "declined",
  Disabled: "disabled",
  AlreadyRegistered: "already_registered",
  Misconfigured: "misconfigured"
} as const;

export type RegisterStatus = (typeof RegisterStatus)[keyof typeof RegisterStatus];

export type RegisterOutcome =
  | { status: typeof RegisterStatus.Registered; athleteId: string; sessionId: string }
  /** No access code in the message: the fixed answer was sent. */
  | { status: typeof RegisterStatus.Declined }
  /** No onboarding agent or no access code set in the admin: unknown numbers stay ignored. */
  | { status: typeof RegisterStatus.Disabled }
  /** Another first message of the same sender won the race and registered them. */
  | { status: typeof RegisterStatus.AlreadyRegistered }
  /** The control plane cannot host the session as configured; `reason` says what to fix. */
  | { status: typeof RegisterStatus.Misconfigured; reason: string };

export interface RegisterNewAthlete {
  execute(sender: UnknownSender): Promise<RegisterOutcome>;
}

/** Whether the message carries the access code, whatever its case or surrounding text. */
export function carriesAccessCode(text: string, accessCode: string): boolean {
  return text.toLowerCase().includes(accessCode.trim().toLowerCase());
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
      if (!onboardingAgentId || !accessCode) return { status: RegisterStatus.Disabled };

      if (!carriesAccessCode(sender.text, accessCode)) {
        await deps.replier.replyToChat(sender.chatId, NO_ACCESS_CODE_REPLY);
        return { status: RegisterStatus.Declined };
      }

      const elements = sessionElementsFrom(await deps.brain.listInventory(), onboardingAgentId);
      if (typeof elements === "string") return { status: RegisterStatus.Misconfigured, reason: elements };

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
      if (!athlete) return { status: RegisterStatus.AlreadyRegistered };

      await deps.brain.appendUserMessage(created.sessionId, formatOnboardingTurn(athlete, NOTHING_DONE, sender.text));
      return { status: RegisterStatus.Registered, athleteId: athlete.id, sessionId: created.sessionId };
    }
  };
}
