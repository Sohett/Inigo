import { describe, it, expect, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import type { BrainSessionTemplate } from "../domain/brain";
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
  managedAgentId: "agent_old"
};

const template: BrainSessionTemplate = {
  coordinatorAgentId: "agent_coord",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  memoryStoreId: "memstore_1",
  memoryStoreAccess: "read_only",
  updatedAt: new Date("2026-09-01T00:00:00Z")
};

type CreateSession = ManagedAgentBrain["createSession"];

function makeDeps(
  overrides: {
    athlete?: Athlete | null;
    template?: BrainSessionTemplate | null;
    createSession?: CreateSession;
  } = {}
) {
  const createSession = vi.fn<CreateSession>(
    overrides.createSession ?? (() => Promise.resolve({ sessionId: "sesn_new", agentVersion: 16 }))
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
      setSession
    },
    brainConfig: {
      get: vi.fn(() =>
        Promise.resolve(overrides.template === undefined ? template : overrides.template)
      ),
      save: vi.fn()
    },
    brain: { appendUserMessage: vi.fn(), createSession },
    now: () => new Date("2026-09-05T12:00:00Z")
  };

  return { deps, createSession, setSession };
}

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

describe("startAthleteSession", () => {
  it("creates the session from the template and repoints the athlete at it", async () => {
    const { deps, createSession, setSession } = makeDeps();

    const outcome = await createStartAthleteSession(deps).execute(athlete.id);

    expect(createSession).toHaveBeenCalledWith({
      agentId: "agent_coord",
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: [{ type: "memory_store", memory_store_id: "memstore_1", access: "read_only" }],
      title: "Inigo · Thomas · 2026-09-05"
    });
    expect(setSession).toHaveBeenCalledWith(athlete.id, "sesn_new", "agent_coord");
    expect(outcome).toEqual({
      status: "started",
      athleteId: athlete.id,
      sessionId: "sesn_new",
      agentVersion: 16,
      previousSessionId: "sesn_old"
    });
  });

  it("omits the memory-store resource when the template has none", async () => {
    const { deps, createSession } = makeDeps({ template: { ...template, memoryStoreId: null } });

    await createStartAthleteSession(deps).execute(athlete.id);

    expect(createSession).toHaveBeenCalledWith(
      expect.not.objectContaining({ resources: expect.anything() })
    );
  });

  it("reports a null previous session for an athlete who had none", async () => {
    const { deps } = makeDeps({ athlete: { ...athlete, anthropicSessionId: null } });

    const outcome = await createStartAthleteSession(deps).execute(athlete.id);

    expect(outcome).toMatchObject({ status: "started", previousSessionId: null });
  });

  it("fails without touching the brain when the athlete is unknown", async () => {
    const { deps, createSession } = makeDeps({ athlete: null });

    const outcome = await createStartAthleteSession(deps).execute(athlete.id);

    expect(outcome).toEqual({ status: "failed", reason: StartSessionFailure.AthleteNotFound });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("fails without touching the brain when the brain is not configured", async () => {
    const { deps, createSession } = makeDeps({ template: null });

    const outcome = await createStartAthleteSession(deps).execute(athlete.id);

    expect(outcome).toEqual({ status: "failed", reason: StartSessionFailure.BrainNotConfigured });
    expect(createSession).not.toHaveBeenCalled();
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
