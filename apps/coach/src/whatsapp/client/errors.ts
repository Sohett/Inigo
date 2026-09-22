/**
 * Error raised when the OpenWA gateway refuses a send, does not answer, or answers a failure.
 *
 * Its message is composed by the client, which redacts the gateway session id first: these
 * messages surface to the model as tool results, and no infrastructure identifier belongs
 * there. The API key never reaches this class at all.
 */
export class OpenWaApiError extends Error {
  /** HTTP status of the gateway's answer, or null when it never answered. */
  readonly status: number | null;

  constructor(message: string, params: { status: number | null }) {
    super(message);
    this.name = "OpenWaApiError";
    this.status = params.status;
  }
}
