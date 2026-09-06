import type Anthropic from "@anthropic-ai/sdk";
import type {
  BrainInventory,
  RunningSession,
  SessionElements,
  SessionResource
} from "../domain/brain";

type SessionCreateParams = Parameters<Anthropic["beta"]["sessions"]["create"]>[0];
type SessionResourceParams = NonNullable<SessionCreateParams["resources"]>[number];

export interface CreateSessionInput extends SessionElements {
  title?: string;
}

export interface CreatedSession {
  /** The new session (`sesn_…`). */
  sessionId: string;
  /** The concrete agent version the session captured. */
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
   * Read what a live session actually runs on: its agent, environment, vaults and
   * resources. This is the source of truth for opening the next one — a copy kept
   * anywhere else could drift from the control plane; this cannot.
   */
  readSession(sessionId: string): Promise<RunningSession>;

  /**
   * Open a brand-new session on an agent.
   *
   * Referencing the agent **by id** pins its *latest* version at creation time, and a
   * session freezes that config for its whole life (only `tools`/`mcp_servers` can change
   * afterwards). Creating a fresh session is therefore the only way a newly deployed agent
   * version takes effect at runtime — which is exactly what the admin button is for.
   */
  createSession(input: CreateSessionInput): Promise<CreatedSession>;

  /**
   * List what exists in the control plane. Only needed to open a *first* session for an
   * athlete who has none to clone; an athlete with a session never consults this.
   */
  listInventory(): Promise<BrainInventory>;
}

/**
 * Map a resource as the API *returns* it onto the shape it *accepts* back.
 *
 * Reads carry output-only fields (`id`, `created_at`, `updated_at`, `mount_path`,
 * `name`, `description`) that create rejects, so a clone cannot echo the read verbatim.
 * A `github_repository` goes further: creating one needs an `authorization_token` that
 * reads never return, so it genuinely cannot be reproduced. We throw rather than open a
 * session silently missing its credential.
 */
export function toSessionResource(resource: {
  type: string;
  memory_store_id?: string;
  access?: string | null;
  instructions?: string | null;
  file_id?: string;
  mount_path?: string | null;
}): SessionResource {
  if (resource.type === "memory_store" && resource.memory_store_id) {
    return {
      kind: "memory_store",
      memoryStoreId: resource.memory_store_id,
      access: resource.access === "read_write" ? "read_write" : "read_only",
      instructions: resource.instructions ?? null
    };
  }
  if (resource.type === "file" && resource.file_id) {
    return { kind: "file", fileId: resource.file_id, mountPath: resource.mount_path ?? null };
  }
  if (resource.type === "github_repository") {
    throw new Error(
      "This session mounts a github_repository, which cannot be cloned: creating one requires " +
        "an authorization token the API never returns. Open the new session from the console."
    );
  }
  throw new Error(`Unsupported session resource type: ${resource.type}`);
}

/** The reverse mapping: our domain resource onto the SDK's create params. */
function toResourceParams(resource: SessionResource): SessionResourceParams {
  if (resource.kind === "memory_store") {
    return {
      type: "memory_store",
      memory_store_id: resource.memoryStoreId,
      access: resource.access,
      ...(resource.instructions === null ? {} : { instructions: resource.instructions })
    } as SessionResourceParams;
  }
  return {
    type: "file",
    file_id: resource.fileId,
    ...(resource.mountPath === null ? {} : { mount_path: resource.mountPath })
  } as SessionResourceParams;
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

    async readSession(sessionId: string): Promise<RunningSession> {
      const session = await anthropic.beta.sessions.retrieve(sessionId);
      return {
        sessionId: session.id,
        agentId: session.agent.id,
        agentName: session.agent.name,
        agentVersion: session.agent.version,
        status: session.status,
        environmentId: session.environment_id,
        vaultIds: session.vault_ids,
        resources: session.resources.map(toSessionResource)
      };
    },

    async createSession(input: CreateSessionInput): Promise<CreatedSession> {
      const session = await anthropic.beta.sessions.create({
        agent: input.agentId,
        environment_id: input.environmentId,
        vault_ids: input.vaultIds,
        resources: input.resources.map(toResourceParams),
        ...(input.title ? { title: input.title } : {})
      } as SessionCreateParams);
      return { sessionId: session.id, agentVersion: session.agent.version };
    },

    async listInventory(): Promise<BrainInventory> {
      const [agents, environments, vaults, memoryStores] = await Promise.all([
        anthropic.beta.agents.list(),
        anthropic.beta.environments.list(),
        anthropic.beta.vaults.list(),
        anthropic.beta.memoryStores.list()
      ]);
      return {
        agents: agents.data.map((agent) => ({
          id: agent.id,
          name: agent.name,
          version: agent.version,
          isCoordinator: agent.multiagent !== null
        })),
        environments: environments.data.map((env) => ({ id: env.id, name: env.name })),
        // Vaults label themselves `display_name`, unlike every other element.
        vaults: vaults.data.map((vault) => ({ id: vault.id, name: vault.display_name })),
        memoryStores: memoryStores.data.map((store) => ({ id: store.id, name: store.name }))
      };
    }
  };
}
