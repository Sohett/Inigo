import { describe, it, expect, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import type { RunningSession } from "../domain/brain";
import type { ManagedAgentBrain } from "../brain/managedAgents";
import {
  createStartAthleteSession,
  sessionTitle,
  StartSessionFailure,
  type StartAthleteSessionDeps
} from "./startAthleteSession";

const athlete: Athlete = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Thomas",
  phoneNum: "+32470000000",
  whatsappLid: null,
  chatId: "32470000000@c.us",
  status: "active",
  anthropicSessionId: "sesn_old",
  managedAgentId: "agent_coord"
};

const running: RunningSession = {
  sessionId: "sesn_old",
  agentId: "agent_coord",
  agentName: "inigo-coordinateur",
  agentVersion: 16,
  status: "idle",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  resources: [
    { kind: "memory_store", memoryStoreId: "memstore_1", access: "read_only", instructions: null }
  ]
};

type CreateSession = ManagedAgentBrain["createSession"];
type ReadSession = ManagedAgentBrain["readSession"];

function makeDeps(
  overrides: {
    athlete?: Athlete | null;
    readSession?: ReadSession;
    createSession?: CreateSession;
  } = {}
) {
  const readSession = vi.fn<ReadSession>(overrides.readSession ?? (() => Promise.resolve(running)));
  const createSession = vi.fn<CreateSession>(
    overrides.createSession ?? (() => Promise.resolve({ sessionId: "sesn_new", agentVersion: 17 }))
  );
  const setSession = vi.fn(() => Promise.resolve());

  const deps: StartAthleteSessionDeps = {
    repo: {
      findByPhone: vi.fn(),
      findByLid: vi.fn(),
      setChatId: vi.fn(),
      findById: vi.fn(() =>
        Promise.resolve(overrides.athlete === undefined ? athlete : overrides.athlete)
      ),
      listAll: vi.fn(() => Promise.resolve([athlete])),
      setSession,
      listSessions: vi.fn()
    },
    brain: {
      appendUserMessage: vi.fn(),
      readSession,
      createSession,
      listInventory: vi.fn()
    },
    now: () => new Date("2026-09-05T12:00:00Z")
  };

  return { deps, readSession, createSession, setSession };
}

const firstSessionElements = {
  agentId: "agent_coord",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  memoryStoreId: "memstore_1",
  memoryStoreAccess: "read_only"
};

describe("sessionTitle", () => {
  it("uses the display name and the day", () => {
    expect(sessionTitle(athlete, new Date("2026-09-05T12:00:00Z"))).toBe(
      "Inigo · Thomas · 2026-09-05"
    );
  });

  it("falls back to the phone number when there is no display name", () => {
    expect(sessionTitle({ ...athlete, displayName: null }, new Date("2026-09-05T12:00:00Z"))).toBe(
      "Inigo · +32470000000 · 2026-09-05"
    );
  });
});

describe("startAthleteSession — cloning a live session", () => {
  it("recreates the running session's elements and repoints the athlete", async () => {
    const { deps, readSession, createSession, setSession } = makeDeps();

    const outcome = await createStartAthleteSession(deps).execute(athlete.id);

    expect(readSession).toHaveBeenCalledWith("sesn_old");
    expect(createSession).toHaveBeenCalledWith({
      agentId: "agent_coord",
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: running.resources,
      title: "Inigo · Thomas · 2026-09-05"
    });
    expect(setSession).toHaveBeenCalledWith(athlete.id, "sesn_new", "agent_coord");
    expect(outcome).toEqual({
      status: "started",
      athleteId: athlete.id,
      sessionId: "sesn_new",
      agentVersion: 17,
      previousSessionId: "sesn_old",
      source: "cloned"
    });
  });

  it("ignores supplied elements when there is a session to clone", async () => {
    const { deps, createSession } = makeDeps();

    await createStartAthleteSession(deps).execute(athlete.id, {
      agentId: "agent_someone_else",
      environmentId: "env_other"
    });

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent_coord", environmentId: "env_1" })
    );
  });

  it("carries the elements over verbatim, whatever they are", async () => {
    const { deps, createSession } = makeDeps({
      readSession: () =>
        Promise.resolve({
          ...running,
          vaultIds: ["vlt_1", "vlt_2"],
          resources: [{ kind: "file", fileId: "file_1", mountPath: "/mnt/x" }]
        })
    });

    await createStartAthleteSession(deps).execute(athlete.id);

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultIds: ["vlt_1", "vlt_2"],
        resources: [{ kind: "file", fileId: "file_1", mountPath: "/mnt/x" }]
      })
    );
  });

  it("leaves the athlete on their previous session when the read fails", async () => {
    const { deps, createSession, setSession } = makeDeps({
      readSession: () => Promise.reject(new Error("session gone"))
    });

    await expect(createStartAthleteSession(deps).execute(athlete.id)).rejects.toThrow(
      "session gone"
    );
    expect(createSession).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("leaves the athlete on their previous session when the create fails", async () => {
    const { deps, setSession } = makeDeps({
      createSession: () => Promise.reject(new Error("anthropic down"))
    });

    await expect(createStartAthleteSession(deps).execute(athlete.id)).rejects.toThrow(
      "anthropic down"
    );
    expect(setSession).not.toHaveBeenCalled();
  });
});

describe("startAthleteSession — first session", () => {
  const newcomer = { ...athlete, anthropicSessionId: null, managedAgentId: null };

  it("builds the session from the supplied elements, without reading anything", async () => {
    const { deps, readSession, createSession, setSession } = makeDeps({ athlete: newcomer });

    const outcome = await createStartAthleteSession(deps).execute(
      newcomer.id,
      firstSessionElements
    );

    expect(readSession).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledWith({
      agentId: "agent_coord",
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: [
        {
          kind: "memory_store",
          memoryStoreId: "memstore_1",
          access: "read_only",
          instructions: null
        }
      ],
      title: "Inigo · Thomas · 2026-09-05"
    });
    expect(setSession).toHaveBeenCalledWith(newcomer.id, "sesn_new", "agent_coord");
    expect(outcome).toMatchObject({ status: "started", previousSessionId: null, source: "chosen" });
  });

  it("omits the memory-store resource when none is chosen", async () => {
    const { deps, createSession } = makeDeps({ athlete: newcomer });

    await createStartAthleteSession(deps).execute(newcomer.id, {
      ...firstSessionElements,
      memoryStoreId: null
    });

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ resources: [] }));
  });

  it("fails when no elements are supplied and there is nothing to clone", async () => {
    const { deps, createSession } = makeDeps({ athlete: newcomer });

    const outcome = await createStartAthleteSession(deps).execute(newcomer.id);

    expect(outcome).toEqual({ status: "failed", reason: StartSessionFailure.NoSessionToClone });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects ids with the wrong prefix, naming every offending field", async () => {
    const { deps, createSession } = makeDeps({ athlete: newcomer });

    const outcome = await createStartAthleteSession(deps).execute(newcomer.id, {
      ...firstSessionElements,
      agentId: "env_oops",
      environmentId: "agent_oops"
    });

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("expected failure");
    expect(outcome.reason).toBe(StartSessionFailure.InvalidElements);
    expect(outcome.issues?.join(" ")).toContain("agentId");
    expect(outcome.issues?.join(" ")).toContain("environmentId");
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("startAthleteSession — unknown athlete", () => {
  it("fails without touching the brain", async () => {
    const { deps, readSession, createSession } = makeDeps({ athlete: null });

    const outcome = await createStartAthleteSession(deps).execute(athlete.id);

    expect(outcome).toEqual({ status: "failed", reason: StartSessionFailure.AthleteNotFound });
    expect(readSession).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
