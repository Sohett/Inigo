import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createBrainClient } from "../client";
import {
  buildUploadables,
  deploySkill,
  listSkillFiles,
  planDeploySkill,
  readSkillName
} from "./deploySkill";

const API = "https://api.anthropic.com/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const skillDir = path.join(repoRoot, "tooling/agent-skills/intervals-icu-workouts");
const client = () => createBrainClient("sk-ant-test", { maxRetries: 0 });

describe("skill folder parsing", () => {
  it("reads the name from SKILL.md frontmatter", async () => {
    expect(await readSkillName(skillDir)).toBe("intervals-icu-workouts");
  });

  it("lists uploadable files with SKILL.md at the top level", async () => {
    const files = await listSkillFiles(skillDir);
    expect(files).toContain("SKILL.md");
    expect(files.every((f) => !f.endsWith(".zip"))).toBe(true);
  });

  it("prefixes uploaded files with the skill folder (SKILL.md inside it)", async () => {
    const files = await listSkillFiles(skillDir);
    const uploads = await buildUploadables(skillDir, files, "intervals-icu-workouts");
    const names = uploads.map((u) => (u as { name: string }).name);
    expect(names).toContain("intervals-icu-workouts/SKILL.md");
    expect(names.every((n) => n.startsWith("intervals-icu-workouts/"))).toBe(true);
  });
});

describe("deploySkill", () => {
  it("plans a create when no matching skill exists", async () => {
    server.use(
      http.get(`${API}/skills`, () => HttpResponse.json({ data: [], next_page: null }))
    );
    const plan = await planDeploySkill(client(), skillDir);
    expect(plan.action).toBe("create");
    expect(plan.existingSkillId).toBeUndefined();
    expect(plan.skillName).toBe("intervals-icu-workouts");
  });

  it("plans a new-version when a matching skill exists", async () => {
    server.use(
      http.get(`${API}/skills`, () =>
        HttpResponse.json({
          data: [{ id: "skill_existing", display_title: "intervals-icu-workouts" }],
          next_page: null
        })
      )
    );
    const plan = await planDeploySkill(client(), skillDir);
    expect(plan.action).toBe("new-version");
    expect(plan.existingSkillId).toBe("skill_existing");
  });

  it("does not call any write endpoint in dry-run mode", async () => {
    server.use(
      http.get(`${API}/skills`, () => HttpResponse.json({ data: [], next_page: null })),
      http.post(`${API}/skills`, () => HttpResponse.json({ error: "should not be called" }, { status: 500 }))
    );
    const result = await deploySkill(client(), skillDir, { apply: false });
    expect(result.applied).toBe(false);
    expect(result.skillId).toBeUndefined();
  });

  it("creates the skill when applied", async () => {
    server.use(
      http.get(`${API}/skills`, () => HttpResponse.json({ data: [], next_page: null })),
      http.post(`${API}/skills`, () =>
        HttpResponse.json({
          id: "skill_new",
          display_title: "intervals-icu-workouts",
          latest_version: "1700000000"
        })
      )
    );
    const result = await deploySkill(client(), skillDir, { apply: true });
    expect(result.applied).toBe(true);
    expect(result.skillId).toBe("skill_new");
    expect(result.version).toBe("1700000000");
  });
});
