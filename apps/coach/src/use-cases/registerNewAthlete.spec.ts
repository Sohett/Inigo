import { describe, expect, it, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import type { BrainInventory } from "../domain/brain";
import type { OnboardingSettings } from "../domain/onboarding";
import {
  carriesAccessCode,
  createRegisterNewAthlete,
  NO_ACCESS_CODE_REPLY,
  onboardingSessionElements,
  type UnknownSender
} from "./registerNewAthlete";

const AGENT = "agent_onboarding";
const SETTINGS: OnboardingSettings = {
  onboardingAgentId: AGENT,
  coordinatorAgentId: "agent_coordinator",
  accessCode: "VELO26"
};
const INVENTORY: BrainInventory = {
  agents: [
    { id: AGENT, name: "Inigo Onboarding Agent", version: 5, isCoordinator: false },
    { id: "agent_coordinator", name: "inigo-coordinateur", version: 23, isCoordinator: true }
  ],
  environments: [{ id: "env_1", name: "prod" }],
  vaults: [{ id: "vlt_1", name: "inigo" }],
  memoryStores: []
};
const SENDER: UnknownSender = {
  phoneNum: "+32470000001",
  whatsappLid: null,
  chatId: "32470000001@c.us",
  text: "Salut Inigo, mon code : velo26"
};
const REGISTERED: Athlete = {
  id: "athlete-new",
  displayName: null,
  phoneNum: SENDER.phoneNum,
  whatsappLid: null,
  chatId: SENDER.chatId,
  status: "onboarding",
  activeSession: { sessionId: "sesn_new", agentId: AGENT }
};

function setup(
  overrides: { settings?: OnboardingSettings; inventory?: BrainInventory; registered?: Athlete | null } = {}
) {
  const calls: string[] = [];
  const brain = {
    listInventory: vi.fn(async () => overrides.inventory ?? INVENTORY),
    createSession: vi.fn(async () => {
      calls.push("createSession");
      return { sessionId: "sesn_new", agentVersion: 5 };
    }),
    appendUserMessage: vi.fn(async () => {
      calls.push("appendUserMessage");
    }),
    readSession: vi.fn()
  };
  const registerOnboardingAthlete = vi.fn(async () => {
    calls.push("registerOnboardingAthlete");
    return overrides.registered === undefined ? REGISTERED : overrides.registered;
  });
  const replyToChat = vi.fn(async () => undefined);
  const useCase = createRegisterNewAthlete({
    repo: { registerOnboardingAthlete },
    settings: { get: vi.fn(async () => overrides.settings ?? SETTINGS) },
    brain,
    replier: { replyToChat },
    now: () => new Date("2026-10-12T10:00:00Z")
  });
  return { useCase, brain, registerOnboardingAthlete, replyToChat, calls };
}

describe("carriesAccessCode", () => {
  it.each([
    ["VELO26", true],
    ["mon code : velo26 !", true],
    ["  Velo26", true],
    ["velo 26", false],
    ["salut", false]
  ])("%s carries the code: %s", (text, expected) => {
    expect(carriesAccessCode(text, " VELO26 ")).toBe(expected);
  });
});

describe("onboardingSessionElements", () => {
  it("uses the configured agent with the single environment and vault", () => {
    expect(onboardingSessionElements(INVENTORY, AGENT)).toEqual({
      agentId: AGENT,
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: []
    });
  });

  it.each<[string, BrainInventory, RegExp]>([
    ["an unknown agent", { ...INVENTORY, agents: [] }, /does not exist/],
    ["no environment", { ...INVENTORY, environments: [] }, /exactly one environment, found 0/],
    [
      "two environments",
      { ...INVENTORY, environments: [...INVENTORY.environments, { id: "env_2", name: "dev" }] },
      /exactly one environment, found 2/
    ],
    ["no vault", { ...INVENTORY, vaults: [] }, /exactly one vault, found 0/]
  ])("refuses %s", (_label, inventory, reason) => {
    expect(onboardingSessionElements(inventory, AGENT)).toMatch(reason);
  });
});

describe("registerNewAthlete", () => {
  it("registers a sender with the code: session, then athlete, then the first message", async () => {
    const { useCase, brain, registerOnboardingAthlete, calls } = setup();
    const outcome = await useCase.execute(SENDER);

    expect(outcome).toEqual({ status: "registered", athleteId: "athlete-new", sessionId: "sesn_new" });
    expect(calls).toEqual(["createSession", "registerOnboardingAthlete", "appendUserMessage"]);
    expect(brain.createSession).toHaveBeenCalledWith({
      agentId: AGENT,
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: [],
      title: "Inigo · +32470000001 · 2026-10-12"
    });
    expect(registerOnboardingAthlete).toHaveBeenCalledWith({
      phoneNum: "+32470000001",
      whatsappLid: null,
      chatId: "32470000001@c.us",
      session: { sessionId: "sesn_new", agentId: AGENT }
    });
    expect(brain.appendUserMessage).toHaveBeenCalledWith(
      "sesn_new",
      expect.stringContaining(
        "inigo_athlete_id: athlete-new\nonboarding_fait: \nonboarding_manquant: motivation, " +
          "training_background, goal, availability, intervals_connected, ftp, education\n" +
          "message: Salut Inigo, mon code : velo26"
      )
    );
  });

  it("answers the fixed reply to a sender without the code, and creates nothing", async () => {
    const { useCase, brain, registerOnboardingAthlete, replyToChat } = setup();
    const outcome = await useCase.execute({ ...SENDER, text: "salut" });

    expect(outcome).toEqual({ status: "declined" });
    expect(replyToChat).toHaveBeenCalledWith("32470000001@c.us", NO_ACCESS_CODE_REPLY);
    expect(brain.createSession).not.toHaveBeenCalled();
    expect(registerOnboardingAthlete).not.toHaveBeenCalled();
  });

  it.each<[string, OnboardingSettings]>([
    ["no onboarding agent", { ...SETTINGS, onboardingAgentId: null }],
    ["no access code", { ...SETTINGS, accessCode: null }]
  ])("stays silent with %s set", async (_label, settings) => {
    const { useCase, replyToChat, brain } = setup({ settings });
    expect(await useCase.execute(SENDER)).toEqual({ status: "disabled" });
    expect(replyToChat).not.toHaveBeenCalled();
    expect(brain.listInventory).not.toHaveBeenCalled();
  });

  it("refuses to guess when the workspace has several environments", async () => {
    const inventory = {
      ...INVENTORY,
      environments: [...INVENTORY.environments, { id: "env_2", name: "dev" }]
    };
    const { useCase, brain } = setup({ inventory });
    const outcome = await useCase.execute(SENDER);

    expect(outcome).toMatchObject({ status: "misconfigured" });
    expect(brain.createSession).not.toHaveBeenCalled();
  });

  it("forwards nothing when another first message already registered the sender", async () => {
    const { useCase, brain } = setup({ registered: null });
    expect(await useCase.execute(SENDER)).toEqual({ status: "already_registered" });
    expect(brain.appendUserMessage).not.toHaveBeenCalled();
  });

  it("names a LID sender's session after the LID", async () => {
    const { useCase, brain } = setup();
    await useCase.execute({ ...SENDER, phoneNum: null, whatsappLid: "1032@lid", chatId: "1032@lid" });
    expect(brain.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Inigo · 1032@lid · 2026-10-12" })
    );
  });
});
