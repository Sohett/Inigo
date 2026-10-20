import { describe, expect, it } from "vitest";
import { start, whatsappContact } from "@/content/copy";
import { whatsappLink } from "@/lib/whatsapp-link";

describe("whatsappLink", () => {
  it("keeps only the digits of the number", () => {
    expect(whatsappLink("+44 7882 748102", "Salut")).toBe("https://wa.me/447882748102?text=Salut");
  });

  it("encodes the message so it survives the query string", () => {
    const url = new URL(whatsappLink("+32470123456", "Bonjour Inigo, mon code : A&B ?"));
    expect(url.searchParams.get("text")).toBe("Bonjour Inigo, mon code : A&B ?");
  });
});

describe("the landing's start message", () => {
  it("carries the access code, which the coach needs to start onboarding", () => {
    const url = new URL(whatsappLink(whatsappContact.phoneNumber, start.message));
    expect(url.searchParams.get("text")).toContain(whatsappContact.accessCode);
  });

  it("contains no dash, like all visible copy", () => {
    expect(start.message).not.toMatch(/[-—–]/);
  });
});
