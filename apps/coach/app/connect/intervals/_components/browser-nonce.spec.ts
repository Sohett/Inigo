import { describe, expect, it } from "vitest";
import { browserNonceCookie, clearBrowserNonceCookie, readBrowserNonce } from "./browser-nonce";

describe("browser nonce cookie", () => {
  it("is HttpOnly, Secure, Lax and scoped to the connection pages", () => {
    const cookie = browserNonceCookie("abc");
    expect(cookie).toMatch(/^inigo_intervals_connect=abc; Max-Age=900; /);
    expect(cookie).toContain("Path=/connect/intervals");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(clearBrowserNonceCookie()).toMatch(/^inigo_intervals_connect=; Max-Age=0; /);
  });

  it("reads the nonce among other cookies, and nothing when absent", () => {
    const withCookie = new Request("https://app.inigo-coach.com", { headers: { cookie: "a=1; inigo_intervals_connect=abc-_9; b=2" } });
    expect(readBrowserNonce(withCookie)).toBe("abc-_9");
    expect(readBrowserNonce(new Request("https://app.inigo-coach.com"))).toBeUndefined();
  });
});
