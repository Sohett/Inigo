import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createManagedAgentBrain, toSessionResource } from "./managedAgents";

describe("createManagedAgentBrain", () => {
  it("sends a user.message event to the given session", async () => {
    const send = vi.fn(() => Promise.resolve({}));
    const anthropic = { beta: { sessions: { events: { send } } } } as unknown as Anthropic;

    const brain = createManagedAgentBrain(anthropic);
    await brain.appendUserMessage("sesn_123", "hello coach");

    expect(send).toHaveBeenCalledWith("sesn_123", {
      events: [{ type: "user.message", content: [{ type: "text", text: "hello coach" }] }]
    });
  });

  it("reads a live session's elements, dropping the output-only fields", async () => {
    const retrieve = vi.fn(() =>
      Promise.resolve({
        id: "sesn_1",
        agent: { id: "agent_coord", name: "inigo-coordinateur", version: 16 },
        status: "idle",
        environment_id: "env_1",
        vault_ids: ["vlt_1"],
        resources: [
          {
            type: "memory_store",
            memory_store_id: "memstore_1",
            access: "read_only",
            // Output-only: create rejects these, so the mapping must not carry them over.
            name: "Inigo Knowledge Base",
            description: "",
            mount_path: "/mnt/memory/inigo"
          }
        ]
      })
    );
    const anthropic = { beta: { sessions: { retrieve } } } as unknown as Anthropic;

    const session = await createManagedAgentBrain(anthropic).readSession("sesn_1");

    expect(session).toEqual({
      sessionId: "sesn_1",
      agentId: "agent_coord",
      agentName: "inigo-coordinateur",
      agentVersion: 16,
      status: "idle",
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: [
        {
          kind: "memory_store",
          memoryStoreId: "memstore_1",
          access: "read_only",
          instructions: null
        }
      ]
    });
  });

  it("creates a session from the given elements and returns the captured agent version", async () => {
    const create = vi.fn(() =>
      Promise.resolve({ id: "sesn_new", agent: { id: "agent_coord", version: 17 } })
    );
    const anthropic = { beta: { sessions: { create } } } as unknown as Anthropic;

    const created = await createManagedAgentBrain(anthropic).createSession({
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

    expect(create).toHaveBeenCalledWith({
      agent: "agent_coord",
      environment_id: "env_1",
      vault_ids: ["vlt_1"],
      resources: [
        { type: "memory_store", memory_store_id: "memstore_1", access: "read_only" }
      ],
      title: "Inigo · Thomas · 2026-09-05"
    });
    expect(created).toEqual({ sessionId: "sesn_new", agentVersion: 17 });
  });

  it("lists the control plane, flagging the coordinator and reading the vault's own label", async () => {
    const anthropic = {
      beta: {
        agents: {
          list: vi.fn(() =>
            Promise.resolve({
              data: [
                { id: "agent_coord", name: "inigo-coordinateur", version: 16, multiagent: { agents: [] } },
                { id: "agent_sub", name: "inigo-architecte-macro", version: 5, multiagent: null }
              ]
            })
          )
        },
        environments: {
          list: vi.fn(() => Promise.resolve({ data: [{ id: "env_1", name: "Inigo Cloud Env" }] }))
        },
        // Vaults expose `display_name` where every other element exposes `name`.
        vaults: {
          list: vi.fn(() => Promise.resolve({ data: [{ id: "vlt_1", display_name: "Inigo Coach" }] }))
        },
        memoryStores: {
          list: vi.fn(() =>
            Promise.resolve({ data: [{ id: "memstore_1", name: "Inigo Knowledge Base" }] })
          )
        }
      }
    } as unknown as Anthropic;

    const inventory = await createManagedAgentBrain(anthropic).listInventory();

    expect(inventory.agents).toEqual([
      { id: "agent_coord", name: "inigo-coordinateur", version: 16, isCoordinator: true },
      { id: "agent_sub", name: "inigo-architecte-macro", version: 5, isCoordinator: false }
    ]);
    expect(inventory.vaults).toEqual([{ id: "vlt_1", name: "Inigo Coach" }]);
    expect(inventory.environments).toEqual([{ id: "env_1", name: "Inigo Cloud Env" }]);
    expect(inventory.memoryStores).toEqual([{ id: "memstore_1", name: "Inigo Knowledge Base" }]);
  });
});

describe("toSessionResource", () => {
  it("keeps a memory store's access and instructions", () => {
    expect(
      toSessionResource({
        type: "memory_store",
        memory_store_id: "memstore_1",
        access: "read_write",
        instructions: "note"
      })
    ).toEqual({
      kind: "memory_store",
      memoryStoreId: "memstore_1",
      access: "read_write",
      instructions: "note"
    });
  });

  it("defaults an unknown access to read_only rather than guessing wider", () => {
    const resource = toSessionResource({ type: "memory_store", memory_store_id: "memstore_1" });
    expect(resource).toMatchObject({ access: "read_only" });
  });

  it("maps a file resource", () => {
    expect(toSessionResource({ type: "file", file_id: "file_1", mount_path: "/mnt/x" })).toEqual({
      kind: "file",
      fileId: "file_1",
      mountPath: "/mnt/x"
    });
  });

  it("refuses a github repository, whose token the API never returns", () => {
    expect(() => toSessionResource({ type: "github_repository" })).toThrow(/authorization token/);
  });

  it("refuses an unknown resource type rather than dropping it silently", () => {
    expect(() => toSessionResource({ type: "something_new" })).toThrow(/Unsupported/);
  });
});
