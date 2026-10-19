import { describe, expect, it } from "vitest";
import { clearConnectionFlowCookie, connectionFlowCookie, readConnectionFlow } from "./connection-flow";

const FLOW = { state: "link.token.sig~random", codeVerifier: "verifier-0123456789" };

function withCookie(cookie: string): Request {
  return new Request("https://app.inigo-coach.com/connect/intervals/callback", { headers: { cookie } });
}

describe("connection flow cookie", () => {
  it("is HttpOnly, Secure, Lax, short lived and scoped to the connection pages", () => {
    const cookie = connectionFlowCookie(FLOW);
    expect(cookie).toMatch(/^inigo_intervals_connect=[\w-]+; Max-Age=900; /);
    expect(cookie).toContain("Path=/connect/intervals");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(clearConnectionFlowCookie()).toMatch(/^inigo_intervals_connect=; Max-Age=0; /);
  });

  it("reads back the flow it wrote, among other cookies", () => {
    const value = connectionFlowCookie(FLOW).split(";")[0] ?? "";
    expect(readConnectionFlow(withCookie(`a=1; ${value}; b=2`))).toEqual(FLOW);
  });

  it.each([
    ["no cookie", ""],
    ["an empty cookie", "inigo_intervals_connect="],
    ["a value that is not ours", "inigo_intervals_connect=abc"],
    ["a flow without verifier", `inigo_intervals_connect=${Buffer.from(JSON.stringify({ state: "s" })).toString("base64url")}`]
  ])("reads nothing from %s", (_label, cookie) => {
    expect(readConnectionFlow(withCookie(cookie))).toBeUndefined();
  });
});
