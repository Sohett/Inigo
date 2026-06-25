import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIContext } from "astro";

// notify.ts importe `astro:env/server` (module virtuel indisponible hors Astro) :
// on le remplace entièrement pour isoler la logique du endpoint.
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyNewLead: notifyMock }));

import { handleLead } from "./lead-handler";

function makeContext(body: unknown, headers: Record<string, string> = {}): APIContext {
  const request = new Request("http://localhost/api/lead", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { request, clientAddress: "127.0.0.1" } as unknown as APIContext;
}

describe("handleLead (POST /api/lead)", () => {
  beforeEach(() => {
    notifyMock.mockReset();
  });

  it("payload valide → transmet le lead et répond 200", async () => {
    const response = await handleLead(makeContext({ phone: "+32470123456", consent: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const lead = notifyMock.mock.calls[0]?.[0];
    expect(lead).toMatchObject({ phone: "+32470123456", consent: true, source: "landing-page" });
  });

  it("numéro invalide → 400 sans transmission", async () => {
    const response = await handleLead(makeContext({ phone: "12", consent: true }));
    expect(response.status).toBe(400);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("honeypot rempli → 200 sans transmission", async () => {
    const response = await handleLead(
      makeContext({ phone: "+32470123456", consent: true, _hp: "bot" }),
    );
    expect(response.status).toBe(200);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("consentement absent → 400 sans transmission", async () => {
    const response = await handleLead(makeContext({ phone: "+32470123456" }));
    expect(response.status).toBe(400);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("JSON illisible → 400 sans transmission", async () => {
    const request = new Request("http://localhost/api/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "pas du json",
    });
    const response = await handleLead({ request, clientAddress: "127.0.0.1" } as unknown as APIContext);
    expect(response.status).toBe(400);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
