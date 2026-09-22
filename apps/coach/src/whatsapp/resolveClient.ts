import { OpenWaClient } from "./client";
import { openWaCredentials } from "./credentials";

/** Builds the gateway client on demand. See `createOpenWaResolver`. */
export type ResolveOpenWaClient = () => OpenWaClient;

/**
 * Build the OpenWA client resolver used by the MCP tool.
 *
 * A *resolver*, not a client: `getDeps()` is shared by every request path, so constructing the
 * client eagerly would make a missing WhatsApp variable throw for the webhook and the other two
 * MCP servers too. Resolving on call keeps the blast radius on the WhatsApp tool, where the
 * thrown message becomes a clean tool error that names no secret.
 */
export function createOpenWaResolver(env: NodeJS.ProcessEnv = process.env): ResolveOpenWaClient {
  return () => {
    const credentials = openWaCredentials(env);
    if (!credentials) {
      throw new Error(
        "WhatsApp gateway is not configured. Set OPENWA_BASE_URL and OPENWA_API_KEY on the " +
          "coach deployment (see apps/coach/.env.example)."
      );
    }
    return new OpenWaClient(credentials);
  };
}
