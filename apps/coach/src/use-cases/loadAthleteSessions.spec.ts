import { describe, it, expect, vi } from "vitest";
import type { Athlete, AthleteSession } from "../domain/athlete";
import type { BrainInventory, RunningSession } from "../domain/brain";
import { createLoadAthleteSessions, type LoadAthleteSessionsDeps } from "./loadAthleteSessions";

const withSession: Athlete = {
  id: "a-1",
  displayName: "Thomas",
  phoneNum: "+32470000000",
  whatsappLid: null,
  chatId: null,
  status: "active",
  timezone: "Europe/Brussels",
  locale: "fr",
  activeSession: { sessionId: "sesn_1", agentId: "agent_coord" }
};

const withoutSession: Athlete = { ...withSession, id: "a-2", activeSession: null };

const running: RunningSession = {
  sessionId: "sesn_1",
  agentId: "agent_coord",
  agentName: "inigo-coordinateur",
  agentVersion: 16,
  status: "idle",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  resources: []
};

const inventory: BrainInventory = {
  agents: [{ id: "agent_coord", name: "inigo-coordinateur", version: 16, isCoordinator: true }],
  environments: [{ id: "env_1", name: "Inigo Cloud Env" }],
  vaults: [{ id: "vlt_1", name: "Inigo Coach" }],
  memoryStores: [{ id: "memstore_1", name: "Inigo Knowledge Base" }]
};

function makeDeps(
  athlete: Athlete | null,
  overrides: {
    readSession?: LoadAthleteSessionsDeps["brain"]["readSession"];
    listInventory?: LoadAthleteSessionsDeps["brain"]["listInventory"];
    listSessions?: LoadAthleteSessionsDeps["repo"]["listSessions"];
  } = {}
) {
  const readSession = vi.fn(overrides.readSession ?? (() => Promise.resolve(running)));
  const listInventory = vi.fn(overrides.listInventory ?? (() => Promise.resolve(inventory)));
  const listSessions = vi.fn(overrides.listSessions ?? (() => Promise.resolve([])));
  const deps: LoadAthleteSessionsDeps = {
    repo: {
      findBySender: vi.fn(),
      rememberSender: vi.fn(),
      findById: vi.fn(() => Promise.resolve(athlete)),
      listAll: vi.fn(),
      setSession: vi.fn(),
      listSessions,
      registerOnboardingAthlete: vi.fn(),
      completeOnboarding: vi.fn()
    },
    brain: {
      appendUserMessage: vi.fn(),
      createSession: vi.fn(),
      readSession,
      listInventory,
      latestAgentVersion: vi.fn(),
      readExchanges: vi.fn(),
      archiveSession: vi.fn()
    }
  };
  return { deps, readSession, listInventory, listSessions };
}

describe("loadAthleteSessions", () => {
  it("returns null for an unknown athlete, without reading the control plane", async () => {
    const { deps, readSession, listInventory } = makeDeps(null);

    expect(await createLoadAthleteSessions(deps).execute("a-404")).toBeNull();
    expect(readSession).not.toHaveBeenCalled();
    expect(listInventory).not.toHaveBeenCalled();
  });

  it("reads the live session and the inventory", async () => {
    const { deps, readSession } = makeDeps(withSession);

    const result = await createLoadAthleteSessions(deps).execute("a-1");

    expect(readSession).toHaveBeenCalledWith("sesn_1");
    expect(result).toEqual({
      athlete: withSession,
      session: running,
      sessionError: null,
      pastSessions: [],
      inventory,
      inventoryError: null
    });
  });

  it("reads no session for an athlete without one, but still the inventory for a first one", async () => {
    const { deps, readSession } = makeDeps(withoutSession);

    const result = await createLoadAthleteSessions(deps).execute("a-2");

    expect(readSession).not.toHaveBeenCalled();
    expect(result?.session).toBeNull();
    expect(result?.sessionError).toBeNull();
    expect(result?.inventory).toEqual(inventory);
  });

  it("surfaces a broken session instead of failing", async () => {
    const { deps } = makeDeps(withSession, {
      readSession: () => Promise.reject(new Error("404 session not found"))
    });

    const result = await createLoadAthleteSessions(deps).execute("a-1");

    expect(result?.session).toBeNull();
    expect(result?.sessionError).toContain("404 session not found");
  });

  it("degrades instead of failing when the inventory is unreachable", async () => {
    const { deps } = makeDeps(withSession, {
      listInventory: () => Promise.reject(new Error("anthropic down"))
    });

    const result = await createLoadAthleteSessions(deps).execute("a-1");

    expect(result?.inventory).toBeNull();
    expect(result?.inventoryError).toContain("anthropic down");
    expect(result?.session).toEqual(running);
  });

  it("lists the sessions a newer one replaced, without the live one", async () => {
    const live: AthleteSession = {
      sessionId: "sesn_1",
      agentId: "agent_coord",
      startedAt: new Date("2026-09-02T00:00:00Z"),
      endedAt: null
    };
    const replaced: AthleteSession = {
      sessionId: "sesn_0",
      agentId: "agent_coord",
      startedAt: new Date("2026-09-01T00:00:00Z"),
      endedAt: new Date("2026-09-02T00:00:00Z")
    };
    const { deps, listSessions } = makeDeps(withSession, {
      listSessions: () => Promise.resolve([live, replaced])
    });

    const result = await createLoadAthleteSessions(deps).execute("a-1");

    expect(listSessions).toHaveBeenCalledWith("a-1");
    expect(result?.pastSessions).toEqual([replaced]);
  });

  it("fails when our own session history is unreadable", async () => {
    const { deps } = makeDeps(withSession, {
      listSessions: () => Promise.reject(new Error("neon down"))
    });

    await expect(createLoadAthleteSessions(deps).execute("a-1")).rejects.toThrow("neon down");
  });
});
