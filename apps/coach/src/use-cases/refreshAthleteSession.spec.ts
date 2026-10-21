import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CARRY_OVER_MESSAGES,
  CARRY_OVER_MESSAGE_CHARS,
  carryOverFrom,
  createRefreshAthleteSession
} from "./refreshAthleteSession";
import { formatIntervalsConnectedTurn, formatTurn } from "../brain/taskEnvelope";
import type { Athlete } from "../domain/athlete";
import type { RunningSession, SessionExchange, SessionStatus } from "../domain/brain";
import { NOTHING_DONE } from "../domain/onboarding";

const ATHLETE: Athlete = {
  id: "a-1",
  displayName: "Thomas",
  phoneNum: "+32475123456",
  whatsappLid: null,
  chatId: "32475123456@c.us",
  status: "active",
  timezone: "Europe/Brussels",
  locale: "fr",
  activeSession: { sessionId: "sesn_old", agentId: "agent_coord" }
};
const SESSION = { sessionId: "sesn_old", agentId: "agent_coord" };
const AT = new Date("2026-10-20T16:00:00Z");

function running(overrides: Partial<RunningSession> = {}): RunningSession {
  return {
    sessionId: "sesn_old",
    agentId: "agent_coord",
    agentName: "inigo-coordinateur",
    agentVersion: 25,
    status: "idle",
    environmentId: "env_1",
    vaultIds: ["vlt_1"],
    resources: [{ kind: "memory_store", memoryStoreId: "memstore_kb", access: "read_only", instructions: null }],
    ...overrides
  };
}

const EXCHANGES: SessionExchange[] = [
  { author: "athlete", text: formatTurn(ATHLETE, "on garde jeudi ?", AT), at: AT },
  { author: "coach", text: "Oui, seuil jeudi.", at: AT }
];

function makeDeps(session: RunningSession = running(), latestVersion = 29) {
  const brain = {
    readSession: vi.fn((_id: string) => Promise.resolve(session)),
    latestAgentVersion: vi.fn((_agentId: string) => Promise.resolve(latestVersion)),
    readExchanges: vi.fn((_id: string) => Promise.resolve(EXCHANGES)),
    createSession: vi.fn(() => Promise.resolve({ sessionId: "sesn_new", agentVersion: latestVersion })),
    archiveSession: vi.fn((_id: string) => Promise.resolve())
  };
  const repo = {
    replaceSession: vi.fn(() => Promise.resolve(true)),
    findById: vi.fn((_id: string): Promise<Athlete | null> =>
      Promise.resolve({ ...ATHLETE, activeSession: { sessionId: "sesn_winner", agentId: "agent_coord" } })
    )
  };
  const refresh = createRefreshAthleteSession({ repo, brain, now: () => new Date("2026-10-21T08:00:00Z") });
  return { refresh, brain, repo };
}

describe("refreshAthleteSession", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("leaves a session on the agent's latest version alone", async () => {
    const { refresh, brain, repo } = makeDeps(running({ agentVersion: 29 }), 29);

    await expect(refresh.execute(ATHLETE, SESSION)).resolves.toEqual({ status: "current", sessionId: "sesn_old" });
    expect(brain.readSession).toHaveBeenCalledWith("sesn_old");
    expect(brain.latestAgentVersion).toHaveBeenCalledWith("agent_coord");
    expect(brain.createSession).not.toHaveBeenCalled();
    expect(repo.replaceSession).not.toHaveBeenCalled();
  });

  it.each<SessionStatus>(["idle", "terminated"])(
    "moves an outdated %s session to a clone on the latest version, with the end of the conversation",
    async (status) => {
      const { refresh, brain, repo } = makeDeps(running({ status }));

      const outcome = await refresh.execute(ATHLETE, SESSION);

      expect(brain.createSession).toHaveBeenCalledWith({
        agentId: "agent_coord",
        environmentId: "env_1",
        vaultIds: ["vlt_1"],
        resources: [{ kind: "memory_store", memoryStoreId: "memstore_kb", access: "read_only", instructions: null }],
        title: "Inigo · Thomas · 2026-10-21"
      });
      expect(repo.replaceSession).toHaveBeenCalledWith("a-1", "sesn_old", "sesn_new", "agent_coord");
      expect(brain.archiveSession).toHaveBeenCalledWith("sesn_old");
      expect(outcome).toEqual({
        status: "migrated",
        sessionId: "sesn_new",
        previousSessionId: "sesn_old",
        carryOver: [
          { author: "athlete", text: "on garde jeudi ?", at: AT },
          { author: "coach", text: "Oui, seuil jeudi.", at: AT }
        ]
      });
    }
  );

  it("archives the old session only once the athlete points at the new one", async () => {
    const { refresh, brain, repo } = makeDeps();

    await refresh.execute(ATHLETE, SESSION);

    expect(repo.replaceSession.mock.invocationCallOrder[0]).toBeLessThan(
      brain.archiveSession.mock.invocationCallOrder[0] ?? 0
    );
  });

  it.each<SessionStatus>(["running", "rescheduling"])(
    "does not cut a %s turn: the outdated session keeps the message until the next one",
    async (status) => {
      const { refresh, brain, repo } = makeDeps(running({ status }));

      await expect(refresh.execute(ATHLETE, SESSION)).resolves.toEqual({ status: "busy", sessionId: "sesn_old" });
      expect(brain.createSession).not.toHaveBeenCalled();
      expect(repo.replaceSession).not.toHaveBeenCalled();
      expect(brain.archiveSession).not.toHaveBeenCalled();
    }
  );

  it("keeps the athlete on their session when the versions cannot be read", async () => {
    const { refresh, brain } = makeDeps();
    brain.latestAgentVersion.mockRejectedValueOnce(new Error("anthropic down"));

    await expect(refresh.execute(ATHLETE, SESSION)).resolves.toEqual({
      status: "failed",
      sessionId: "sesn_old",
      reason: "could not check the session version"
    });
    expect(brain.createSession).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("anthropic down"));
  });

  it("does not move without the conversation to carry over", async () => {
    const { refresh, brain, repo } = makeDeps();
    brain.readExchanges.mockRejectedValueOnce(new Error("events down"));

    await expect(refresh.execute(ATHLETE, SESSION)).resolves.toMatchObject({ status: "failed", sessionId: "sesn_old" });
    expect(brain.createSession).not.toHaveBeenCalled();
    expect(repo.replaceSession).not.toHaveBeenCalled();
  });

  it("keeps the athlete on their session when the new one cannot be opened", async () => {
    const { refresh, brain, repo } = makeDeps();
    brain.createSession.mockRejectedValueOnce(new Error("create refused"));

    await expect(refresh.execute(ATHLETE, SESSION)).resolves.toMatchObject({ status: "failed", sessionId: "sesn_old" });
    expect(repo.replaceSession).not.toHaveBeenCalled();
    expect(brain.archiveSession).not.toHaveBeenCalled();
  });

  it("keeps the athlete on their session, and the old one live, when the repointing fails", async () => {
    const { refresh, brain, repo } = makeDeps();
    repo.replaceSession.mockRejectedValueOnce(new Error("neon down"));

    await expect(refresh.execute(ATHLETE, SESSION)).resolves.toMatchObject({ status: "failed", sessionId: "sesn_old" });
    expect(brain.archiveSession).not.toHaveBeenCalled();
  });

  it("follows the session a concurrent message already moved the athlete to, and drops its own", async () => {
    const { refresh, brain, repo } = makeDeps();
    repo.replaceSession.mockResolvedValueOnce(false);

    await expect(refresh.execute(ATHLETE, SESSION)).resolves.toEqual({ status: "current", sessionId: "sesn_winner" });
    expect(brain.archiveSession).toHaveBeenCalledWith("sesn_new");
    expect(brain.archiveSession).not.toHaveBeenCalledWith("sesn_old");
  });

  it("still moves the athlete when the old session cannot be archived", async () => {
    const { refresh, brain } = makeDeps();
    brain.archiveSession.mockRejectedValueOnce(new Error("archive refused"));

    await expect(refresh.execute(ATHLETE, SESSION)).resolves.toMatchObject({ status: "migrated", sessionId: "sesn_new" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("archive refused"));
  });
});

describe("carryOverFrom", () => {
  it("reads the athlete's words back from their turns and drops the turns they did not write", () => {
    const exchanges: SessionExchange[] = [
      { author: "athlete", text: formatIntervalsConnectedTurn(ATHLETE, NOTHING_DONE, AT), at: AT },
      { author: "athlete", text: formatTurn(ATHLETE, 'je dis "ok"', AT), at: AT }
    ];

    expect(carryOverFrom(exchanges)).toEqual([{ author: "athlete", text: 'je dis "ok"', at: AT }]);
  });

  it(`keeps only the last ${CARRY_OVER_MESSAGES} messages, oldest first`, () => {
    const exchanges = Array.from({ length: CARRY_OVER_MESSAGES + 3 }, (_, index): SessionExchange => ({
      author: "coach",
      text: `message ${index}`,
      at: AT
    }));

    const carried = carryOverFrom(exchanges);

    expect(carried).toHaveLength(CARRY_OVER_MESSAGES);
    expect(carried[0]?.text).toBe("message 3");
    expect(carried.at(-1)?.text).toBe(`message ${CARRY_OVER_MESSAGES + 2}`);
  });

  it(`cuts a message longer than ${CARRY_OVER_MESSAGE_CHARS} characters`, () => {
    const [carried] = carryOverFrom([{ author: "coach", text: "x".repeat(2000), at: AT }]);

    expect(carried?.text).toHaveLength(CARRY_OVER_MESSAGE_CHARS);
    expect(carried?.text.endsWith("…")).toBe(true);
  });
});
