import { describe, expect, it, vi } from "vitest";
import type { Db } from "@inigo/db";
import { createDrizzleIntervalsCredentialStore } from "./drizzleIntervalsCredentialStore";

const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");

describe("createDrizzleIntervalsCredentialStore", () => {
  it("never lets a failed write carry the query params out", async () => {
    const leaky = new Error("Failed query: insert ... params: 11111111,i42,<sealed key bytes>", {
      cause: { code: "23503" }
    });
    const db = {
      insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.reject(leaky) }) })
    } as unknown as Db;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const saving = createDrizzleIntervalsCredentialStore(db, MASTER_KEY).save(
      "11111111-1111-4111-8111-111111111111",
      { type: "api_key", apiKey: "the-key" },
      "i42"
    );

    await expect(saving).rejects.toThrow(
      /^Could not save the Intervals\.icu credential\. Try again in a moment\.$/
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("23503"));
    expect(JSON.stringify(log.mock.calls)).not.toContain("params");
    log.mockRestore();
  });
});
