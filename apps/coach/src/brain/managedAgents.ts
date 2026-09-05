import type Anthropic from "@anthropic-ai/sdk";

type SessionCreateParams = Parameters<Anthropic["beta"]["sessions"]["create"]>[0];

/** The elements a new session is built from (see `domain/brain.ts` for where they come from). */
export interface CreateSessionInput {
  agentId: string;
  environmentId: string;
  vaultIds?: string[];
  resources?: SessionCreateParams["resources"];
  title?: string;
}

export interface CreatedSession {
  /** The new session (`sesn_…`). */
  sessionId: string;
  /** The concrete agent version the session captured at creation. */
  agentVersion: number;
}

/**
 * The "brain" boundary. Everything that talks to the coach goes through this
 * interface, so the rest of the backend never depends on how the coach is
 * implemented. Today it drives Anthropic managed agents; a future custom backend
 * can implement the same interface.
 */
export interface ManagedAgentBrain {
  /**
   * Append a user message to a managed-agent session. Fire-and-forget: the agent
   * then runs server-side and replies over WhatsApp itself via its OpenWA MCP
   * tool, so we do not read the response here.
   */
  appendUserMessage(sessionId: string, text: string): Promise<void>;

  /**
   * Open a brand-new session on an agent.
   *
   * Referencing the agent **by id** pins its *latest* version at creation time, and a
   * session freezes that config for its whole life (only `tools`/`mcp_servers` can change
   * afterwards). Creating a fresh session is therefore the only way a newly deployed agent
   * version takes effect at runtime — which is exactly what the admin button is for.
   */
  createSession(input: CreateSessionInput): Promise<CreatedSession>;
}

/**
 * Adapt the Anthropic SDK's beta Managed Agents surface to `ManagedAgentBrain`.
 * MCP tool calls the agent makes during a run execute server-side (via the session's
 * vault credentials), so no client needs to stream the run for the reply to be sent.
 */
export function createManagedAgentBrain(anthropic: Anthropic): ManagedAgentBrain {
  return {
    async appendUserMessage(sessionId: string, text: string): Promise<void> {
      await anthropic.beta.sessions.events.send(sessionId, {
        events: [{ type: "user.message", content: [{ type: "text", text }] }]
      });
    },

    async createSession(input: CreateSessionInput): Promise<CreatedSession> {
      const session = await anthropic.beta.sessions.create({
        agent: input.agentId,
        environment_id: input.environmentId,
        ...(input.vaultIds ? { vault_ids: input.vaultIds } : {}),
        ...(input.resources ? { resources: input.resources } : {}),
        ...(input.title ? { title: input.title } : {})
      } as SessionCreateParams);
      return { sessionId: session.id, agentVersion: session.agent.version };
    }
  };
}
