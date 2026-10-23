import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where a magic link lands once Better Auth has made it (INI-85). Its `sendMagicLink` callback is
 * global and sends nothing: the link goes back to the agent, which writes it on WhatsApp. So the
 * code that asks for a link opens a capture around the call, and the callback drops the URL in it.
 *
 * A callback that runs outside a capture did not come from our own code: it is refused, so no
 * request can ever make Better Auth issue a link (on top of the endpoint being disabled).
 */
interface Capture {
  url: string | null;
}

const captures = new AsyncLocalStorage<Capture>();

/** Run `issue` (which asks Better Auth for a link) and return the URL it produced. */
export async function captureMagicLink(issue: () => Promise<unknown>): Promise<string> {
  const capture: Capture = { url: null };
  await captures.run(capture, issue);
  if (capture.url === null) throw new Error("Better Auth issued no magic link.");
  return capture.url;
}

/** For `sendMagicLink`: hand the URL to the capture this call runs in. Throws outside one. */
export function deliverMagicLink(url: string): void {
  const capture = captures.getStore();
  if (!capture) throw new Error("A magic link was requested outside the coach: refused.");
  capture.url = url;
}
