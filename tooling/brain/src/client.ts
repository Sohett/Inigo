import Anthropic from "@anthropic-ai/sdk";

/**
 * Build the Anthropic client used to operate the brain.
 *
 * The SDK automatically sets the required beta headers for the managed-agents
 * (`beta.*`) and skills resources, so callers never hand-roll headers.
 */
export function createBrainClient(apiKey: string, options: { maxRetries?: number } = {}): Anthropic {
  return new Anthropic({ apiKey, ...options });
}

/** The concrete Anthropic client type, re-exported for lib signatures. */
export type BrainClient = Anthropic;
