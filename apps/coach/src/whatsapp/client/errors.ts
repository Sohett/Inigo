/**
 * Error thrown when the OpenWA gateway refuses a send, or answers something we cannot
 * read. Carries enough context to debug without ever embedding the API key or the
 * gateway session id.
 */
export class OpenWaApiError extends Error {
  readonly status: number | null;
  readonly tool: string;

  constructor(message: string, params: { tool: string; status?: number | null }) {
    super(message);
    this.name = "OpenWaApiError";
    this.tool = params.tool;
    this.status = params.status ?? null;
  }
}
