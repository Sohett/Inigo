/**
 * Error thrown when the Intervals.icu API returns a non-2xx response or the
 * response body fails validation. Carries enough context to debug without ever
 * embedding the API key.
 */
export class IntervalsIcuApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly body: unknown;

  constructor(message: string, params: { status: number; endpoint: string; body?: unknown }) {
    super(message);
    this.name = "IntervalsIcuApiError";
    this.status = params.status;
    this.endpoint = params.endpoint;
    this.body = params.body;
  }
}
