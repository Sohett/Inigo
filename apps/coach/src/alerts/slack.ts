/** Slack answers an Incoming Webhook quickly or not at all; don't hold a request for it. */
const SLACK_TIMEOUT_MS = 5_000;

/**
 * Post a message to a Slack Incoming Webhook. Throws on a network failure, a timeout or a
 * non-2xx answer; the caller decides what a failed alert means. The URL is a credential and is
 * never part of an error message.
 */
export async function postSlackMessage(
  webhookUrl: string,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS)
    });
  } catch (cause) {
    throw new Error(`Slack did not answer (${cause instanceof Error ? cause.name : "error"})`);
  }
  if (!response.ok) throw new Error(`Slack answered HTTP ${response.status}`);
}
