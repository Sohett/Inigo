import type Anthropic from "@anthropic-ai/sdk";

/**
 * The "brain" boundary. Everything that talks to the coach goes through this
 * interface, so the rest of the backend never depends on how the coach is
 * implemented. Today it appends a message to an Anthropic managed-agent session;
 * a future custom backend can implement the same interface.
 */
export interface ManagedAgentBrain {
  /**
   * Append a user message to a managed-agent session. Fire-and-forget: the agent
   * then runs server-side and replies over WhatsApp itself via its OpenWA MCP
   * tool, so we do not read the response here.
   */
  appendUserMessage(sessionId: string, text: string): Promise<void>;
}

/**
 * Adapt the Anthropic SDK's beta Managed Agents surface to `ManagedAgentBrain`.
 * The only wire call: send a `user.message` event to the session. MCP tool calls
 * the agent makes during its run execute server-side (via the session's vault
 * credentials), so no client needs to stream the run for the reply to be sent.
 */
export function createManagedAgentBrain(anthropic: Anthropic): ManagedAgentBrain {
  return {
    async appendUserMessage(sessionId: string, text: string): Promise<void> {
      await anthropic.beta.sessions.events.send(sessionId, {
        events: [{ type: "user.message", content: [{ type: "text", text }] }]
      });
    }
  };
}
