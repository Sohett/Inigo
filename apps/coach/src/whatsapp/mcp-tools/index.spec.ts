import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  SendMessageFailure,
  type SendMessageOutcome
} from "../../use-cases/sendAthleteMessage";
import { registerWhatsappTools } from "./index";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

/**
 * This layer owns no decision, so the use-case is a stub: what is under test is the mapping
 * from its outcome onto the MCP result shape, and the shape of the tool itself.
 */
async function connect(execute: () => Promise<SendMessageOutcome>) {
  const spy = vi.fn(execute);
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerWhatsappTools(server, { sendMessage: { execute: spy } });

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, execute: spy };
}

const sent = async (): Promise<SendMessageOutcome> => ({ status: "sent", athleteId: ATHLETE_ID });

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.find((block) => block.type === "text")?.text ?? "";
}

function call(client: Client, text = "salut") {
  return client.callTool({
    name: "send_whatsapp_message",
    arguments: { athleteId: ATHLETE_ID, text }
  });
}

describe("whatsapp MCP tools", () => {
  it("exposes exactly one tool", async () => {
    const { client } = await connect(sent);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["send_whatsapp_message"]);
  });

  // The agent must never carry the gateway session id or a chat id: neither is an input.
  it("takes only the athlete and the text as input", async () => {
    const { client } = await connect(sent);
    const { tools } = await client.listTools();
    const properties = tools[0]?.inputSchema.properties ?? {};
    expect(Object.keys(properties).sort()).toEqual(["athleteId", "text"]);
  });

  it("passes the arguments straight to the use-case and reports the send", async () => {
    const { client, execute } = await connect(sent);
    const result = await call(client);

    expect(execute).toHaveBeenCalledWith(ATHLETE_ID, "salut");
    expect(textOf(result)).toBe('{"sent":true}');
  });

  it.each([
    [SendMessageFailure.AthleteNotFound, "Unknown athlete"],
    [SendMessageFailure.NoChatYet, "have to write first"],
    [SendMessageFailure.NoGatewaySession, "Set it from the coach admin"]
  ])("turns the %s outcome into a tool error the agent can act on", async (reason, expected) => {
    const { client } = await connect(async () => ({ status: "failed", reason }));
    const result = await call(client);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(expected);
  });

  // A gateway breakdown throws out of the use-case; it must reach the agent as a tool error,
  // never as a 500 that would look like the whole MCP server is down.
  it("turns a thrown gateway failure into a tool error", async () => {
    const { client } = await connect(async () => {
      throw new Error("WhatsApp gateway is not configured. Set OPENWA_BASE_URL, …");
    });
    const result = await call(client);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not configured");
  });
});
