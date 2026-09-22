import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Athlete } from "../../domain/athlete";
import type { AthleteRepository } from "../../repositories/athleteRepository";
import { registerWhatsappTools } from "./index";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

const ATHLETE: Athlete = {
  id: ATHLETE_ID,
  displayName: "Thomas",
  phoneNum: "+32475123456",
  whatsappLid: null,
  chatId: "32475123456@c.us",
  status: "active",
  anthropicSessionId: "sesn_1",
  managedAgentId: "agent_1"
};

function createRepo(athlete: Athlete | null): AthleteRepository {
  return { findById: async () => athlete } as unknown as AthleteRepository;
}

async function connect(athlete: Athlete | null, sendText = vi.fn(async () => undefined)) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerWhatsappTools(server, {
    resolve: () => ({ sendText }) as never,
    repo: createRepo(athlete)
  });

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, sendText };
}

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.find((block) => block.type === "text")?.text ?? "";
}

describe("whatsapp MCP tools", () => {
  it("exposes exactly one tool", async () => {
    const { client } = await connect(ATHLETE);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["send_whatsapp_message"]);
  });

  // The agent must never carry the gateway session id: it is not an input of the tool.
  it("takes only the athlete and the text as input", async () => {
    const { client } = await connect(ATHLETE);
    const { tools } = await client.listTools();
    const properties = tools[0]?.inputSchema.properties ?? {};
    expect(Object.keys(properties).sort()).toEqual(["athleteId", "text"]);
  });

  it("resolves the chat from the athlete and sends", async () => {
    const { client, sendText } = await connect(ATHLETE);
    const result = await client.callTool({
      name: "send_whatsapp_message",
      arguments: { athleteId: ATHLETE_ID, text: "salut" }
    });

    expect(sendText).toHaveBeenCalledWith("32475123456@c.us", "salut");
    expect(textOf(result)).toContain("\"sent\": true");
  });

  it("returns a clean error for an unknown athlete, and sends nothing", async () => {
    const { client, sendText } = await connect(null);
    const result = await client.callTool({
      name: "send_whatsapp_message",
      arguments: { athleteId: ATHLETE_ID, text: "salut" }
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unknown athlete");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("explains that the athlete has to write first when no chat is known yet", async () => {
    const { client, sendText } = await connect({ ...ATHLETE, chatId: null });
    const result = await client.callTool({
      name: "send_whatsapp_message",
      arguments: { athleteId: ATHLETE_ID, text: "salut" }
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("no known WhatsApp chat");
    expect(sendText).not.toHaveBeenCalled();
  });

  // A gateway misconfiguration must surface as a tool error, never as a 500 that would look
  // to the agent like the whole MCP server is down.
  it("turns an unconfigured gateway into a tool error", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerWhatsappTools(server, {
      resolve: () => {
        throw new Error("WhatsApp gateway is not configured. Set OPENWA_BASE_URL, …");
      },
      repo: createRepo(ATHLETE)
    });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: "send_whatsapp_message",
      arguments: { athleteId: ATHLETE_ID, text: "salut" }
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not configured");
  });
});
