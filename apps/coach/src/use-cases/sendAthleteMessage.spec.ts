import { describe, it, expect, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import type { AthleteRepository } from "../repositories/athleteRepository";
import { createSendAthleteMessage, SendMessageFailure } from "./sendAthleteMessage";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION = "gateway-session";

const ATHLETE: Athlete = {
  id: ATHLETE_ID,
  displayName: "Thomas",
  phoneNum: "+32475123456",
  whatsappLid: null,
  chatId: "32475123456@c.us",
  status: "active",
  activeSession: { sessionId: "sesn_1", agentId: "agent_1" }
};

function build(
  athlete: Athlete | null,
  sessionId: string | null = SESSION,
  sendText = vi.fn(async () => undefined)
) {
  const repo = { findById: async () => athlete } as unknown as AthleteRepository;
  const gateway = { getSessionId: async () => sessionId, setSessionId: async () => undefined };
  const sendMessage = createSendAthleteMessage({
    repo,
    gateway,
    resolveClient: () => ({ sendText }) as never
  });
  return { sendMessage, sendText };
}

describe("sendAthleteMessage", () => {
  it("sends to the athlete's chat, from the recorded gateway session", async () => {
    const { sendMessage, sendText } = build(ATHLETE);

    await expect(sendMessage.execute(ATHLETE_ID, "salut")).resolves.toEqual({
      status: "sent",
      athleteId: ATHLETE_ID
    });
    expect(sendText).toHaveBeenCalledWith(SESSION, "32475123456@c.us", "salut");
  });

  it("reports an unknown athlete without sending", async () => {
    const { sendMessage, sendText } = build(null);

    await expect(sendMessage.execute(ATHLETE_ID, "salut")).resolves.toEqual({
      status: "failed",
      reason: SendMessageFailure.AthleteNotFound
    });
    expect(sendText).not.toHaveBeenCalled();
  });

  // WhatsApp gives no way to open a conversation from nothing: the chat is learned inbound.
  it("reports an athlete who has never written, without sending", async () => {
    const { sendMessage, sendText } = build({ ...ATHLETE, chatId: null });

    await expect(sendMessage.execute(ATHLETE_ID, "salut")).resolves.toEqual({
      status: "failed",
      reason: SendMessageFailure.NoChatYet
    });
    expect(sendText).not.toHaveBeenCalled();
  });

  // Normal state right after a WhatsApp re-pairing, fixed from the admin rather than by a deploy.
  it("reports a missing gateway session, without sending", async () => {
    const { sendMessage, sendText } = build(ATHLETE, null);

    await expect(sendMessage.execute(ATHLETE_ID, "salut")).resolves.toEqual({
      status: "failed",
      reason: SendMessageFailure.NoGatewaySession
    });
    expect(sendText).not.toHaveBeenCalled();
  });

  // A gateway breakdown is not a business outcome: it throws, and the client's message already
  // says whether a retry is safe.
  it("lets a gateway failure through rather than turning it into an outcome", async () => {
    const sendText = vi.fn(async () => {
      throw new Error("WhatsApp gateway did not answer");
    });
    const { sendMessage } = build(ATHLETE, SESSION, sendText);

    await expect(sendMessage.execute(ATHLETE_ID, "salut")).rejects.toThrow(/did not answer/);
  });
});
