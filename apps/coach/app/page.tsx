import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto grid max-w-2xl gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Inigo coach</h1>
      <p className="text-sm text-muted-foreground">
        Backend for the Inigo coach. It maps inbound WhatsApp messages (from an{" "}
        <code>OpenWA</code> gateway) into a Claude managed agent session; the agent replies
        over WhatsApp itself via its MCP tools.
      </p>
      <p className="text-sm text-muted-foreground">
        Webhook endpoint: <code>/api/webhooks/whatsapp</code>. MCP servers:{" "}
        <code>/api/mcp</code> and <code>/api/intervals/mcp</code>. See <code>README.md</code>.
      </p>
      <p className="text-sm">
        <Link href="/admin" className="underline underline-offset-4">
          Admin
        </Link>
      </p>
    </main>
  );
}
