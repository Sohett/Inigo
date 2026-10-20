/**
 * The Claude Console workspace the brain's sessions live in. `default` is the Console's name for
 * the organisation's default workspace; a named workspace is addressed by its `wrkspc_…` id.
 */
const CONSOLE_WORKSPACE = "default";

/** The session in the Console's session viewer (`/workspaces/<workspace>/sessions/<id>`). */
export function consoleSessionUrl(sessionId: string): string {
  return `https://platform.claude.com/workspaces/${CONSOLE_WORKSPACE}/sessions/${encodeURIComponent(sessionId)}`;
}

/** A session id that opens the session in the Console, in a new tab. */
export function SessionLink({ sessionId }: { sessionId: string }) {
  return (
    <a
      href={consoleSessionUrl(sessionId)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono break-all underline-offset-2 hover:underline"
    >
      {sessionId}
    </a>
  );
}
