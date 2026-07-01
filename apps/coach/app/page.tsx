export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Inigo coach</h1>
      <p>
        Backend for the Inigo coach. Today it exposes one webhook that maps inbound
        WhatsApp messages (from an <code>OpenWA</code> gateway) into a Claude managed
        agent session; the agent replies over WhatsApp itself via its MCP tools.
      </p>
      <p>
        Webhook endpoint: <code>/api/webhooks/whatsapp</code>. Admin dashboards and
        actions will live in this same app. See <code>README.md</code>.
      </p>
    </main>
  );
}
