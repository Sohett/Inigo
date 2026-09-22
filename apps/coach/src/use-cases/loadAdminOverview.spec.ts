import { describe, it, expect, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import type { BrainInventory, RunningSession } from "../domain/brain";
import { createLoadAdminOverview, type LoadAdminOverviewDeps } from "./loadAdminOverview";

const withSession: Athlete = {
  id: "a-1",
  displayName: "Thomas",
  phoneNum: "+32470000000",
  whatsappLid: null,
  chatId: null,
  status: "active",
  anthropicSessionId: "sesn_1",
  managedAgentId: "agent_coord"
};

const withoutSession: Athlete = {
  ...withSession,
  id: "a-2",
  displayName: "Nouvelle",
  anthropicSessionId: null,
  managedAgentId: null
};

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
  athletes: Athlete[],
  overrides: {
    readSession?: LoadAdminOverviewDeps["brain"]["readSession"];
    listInventory?: LoadAdminOverviewDeps["brain"]["listInventory"];
  } = {}
) {
  const readSession = vi.fn(overrides.readSession ?? (() => Promise.resolve(running)));
  const listInventory = vi.fn(overrides.listInventory ?? (() => Promise.resolve(inventory)));
  const deps: LoadAdminOverviewDeps = {
    repo: {
      findByPhone: vi.fn(),
      findByLid: vi.fn(),
      setChatId: vi.fn(),
      findById: vi.fn(),
      listAll: vi.fn(() => Promise.resolve(athletes)),
      setSession: vi.fn()
    },
    gateway: {
      getSessionId: vi.fn(() => Promise.resolve("gateway-session")),
      setSessionId: vi.fn()
    },
    brain: {
      appendUserMessage: vi.fn(),
      createSession: vi.fn(),
      readSession,
      listInventory
    }
  };
  return { deps, readSession, listInventory };
}

describe("loadAdminOverview", () => {
  it("reads each athlete's live session", async () => {
    const { deps, readSession } = makeDeps([withSession]);

    const overview = await createLoadAdminOverview(deps).execute();

    expect(readSession).toHaveBeenCalledWith("sesn_1");
    expect(overview.athletes).toEqual([
      { athlete: withSession, session: running, sessionError: null }
    ]);
  });

  it("skips the inventory when every athlete already has a session", async () => {
    const { deps, listInventory } = makeDeps([withSession]);

    const overview = await createLoadAdminOverview(deps).execute();

    expect(listInventory).not.toHaveBeenCalled();
    expect(overview.inventory).toBeNull();
  });

  it("loads the inventory when an athlete has no session to clone", async () => {
    const { deps, listInventory } = makeDeps([withoutSession]);

    const overview = await createLoadAdminOverview(deps).execute();

    expect(listInventory).toHaveBeenCalled();
    expect(overview.inventory).toEqual(inventory);
    expect(overview.athletes[0]).toEqual({
      athlete: withoutSession,
      session: null,
      sessionError: null
    });
  });

  it("surfaces a broken session on its own row without losing the others", async () => {
    const other: Athlete = { ...withSession, id: "a-3", anthropicSessionId: "sesn_gone" };
    const { deps } = makeDeps([withSession, other], {
      readSession: vi.fn((sessionId: string) =>
        sessionId === "sesn_gone"
          ? Promise.reject(new Error("404 session not found"))
          : Promise.resolve(running)
      )
    });

    const overview = await createLoadAdminOverview(deps).execute();

    expect(overview.athletes[0]?.session).toEqual(running);
    expect(overview.athletes[1]?.session).toBeNull();
    expect(overview.athletes[1]?.sessionError).toContain("404 session not found");
  });

  it("degrades instead of failing when the inventory is unreachable", async () => {
    const { deps } = makeDeps([withoutSession], {
      listInventory: vi.fn(() => Promise.reject(new Error("anthropic down")))
    });

    const overview = await createLoadAdminOverview(deps).execute();

    expect(overview.inventory).toBeNull();
    expect(overview.inventoryError).toContain("anthropic down");
    expect(overview.athletes).toHaveLength(1);
  });
});
