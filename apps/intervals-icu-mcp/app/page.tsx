export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Intervals.icu MCP server</h1>
      <p>
        This service exposes Intervals.icu data as a remote Model Context Protocol (MCP) server.
        The MCP endpoint is <code>/api/mcp</code> and requires a bearer token.
      </p>
      <p>
        Connect it to a Claude Managed Agent via the MCP connector. See the project{" "}
        <code>CLAUDE.md</code> for setup instructions.
      </p>
    </main>
  );
}
