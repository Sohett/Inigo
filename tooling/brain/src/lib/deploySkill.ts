import { promises as fs } from "node:fs";
import path from "node:path";
import { toFile, type Uploadable } from "@anthropic-ai/sdk";
import type { BrainClient } from "../client";
import { ensureApply } from "./writeGuard";

export interface DeploySkillPlan {
  skillDir: string;
  /** `name` from the SKILL.md frontmatter (also used as the skill display title). */
  skillName: string;
  /** Relative posix paths of every file that will be uploaded. */
  files: string[];
  /** Set when a custom skill with this display title already exists. */
  existingSkillId?: string;
  action: "create" | "new-version";
}

export interface DeploySkillResult {
  plan: DeploySkillPlan;
  applied: boolean;
  skillId?: string;
  version?: string;
  attachedToAgent?: string;
}

/** Read the `name:` field from a SKILL.md YAML frontmatter block. */
export async function readSkillName(skillDir: string): Promise<string> {
  const skillMd = path.join(skillDir, "SKILL.md");
  let raw: string;
  try {
    raw = await fs.readFile(skillMd, "utf8");
  } catch {
    throw new Error(`SKILL.md introuvable dans ${skillDir}`);
  }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`Frontmatter YAML absent dans ${skillMd}`);
  const nameLine = match[1]?.split(/\r?\n/).find((l) => /^name:\s*/.test(l));
  const name = nameLine?.replace(/^name:\s*/, "").trim();
  if (!name) throw new Error(`Champ \`name\` absent du frontmatter de ${skillMd}`);
  return name;
}

/** Recursively list uploadable files (relative posix paths), skipping archives
 * and hidden files. */
export async function listSkillFiles(skillDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(rel: string): Promise<void> {
    const entries = await fs.readdir(path.join(skillDir, rel), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name.endsWith(".zip")) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  }
  await walk("");
  out.sort();
  return out;
}

/** Build the deploy plan (read-only): which files, and create vs new-version. */
export async function planDeploySkill(
  client: BrainClient,
  skillDir: string
): Promise<DeploySkillPlan> {
  const skillName = await readSkillName(skillDir);
  const files = await listSkillFiles(skillDir);
  if (!files.includes("SKILL.md")) {
    throw new Error(`Le dossier ${skillDir} doit contenir SKILL.md à la racine.`);
  }

  let existingSkillId: string | undefined;
  for await (const skill of client.beta.skills.list()) {
    if (skill.display_title === skillName) {
      existingSkillId = skill.id;
      break;
    }
  }

  return {
    skillDir,
    skillName,
    files,
    existingSkillId,
    action: existingSkillId ? "new-version" : "create"
  };
}

async function buildUploadables(skillDir: string, files: string[]): Promise<Uploadable[]> {
  return Promise.all(
    files.map(async (rel) => {
      const buf = await fs.readFile(path.join(skillDir, rel));
      // The filename carries the relative path so the server preserves structure.
      return toFile(buf, rel);
    })
  );
}

/**
 * Deploy a skill folder to the workspace Skills API. Read-only unless
 * `opts.apply` is true. When `opts.attachAgentId` is set (and applied), pins the
 * skill (version `latest`) onto that agent as a new agent version.
 */
export async function deploySkill(
  client: BrainClient,
  skillDir: string,
  opts: { apply: boolean; attachAgentId?: string }
): Promise<DeploySkillResult> {
  const plan = await planDeploySkill(client, skillDir);

  if (!opts.apply) {
    return { plan, applied: false };
  }
  ensureApply(opts.apply, `deploy skill ${plan.skillName}`);

  const uploadables = await buildUploadables(skillDir, plan.files);

  let skillId: string;
  let version: string | null;
  if (plan.existingSkillId) {
    const created = await client.beta.skills.versions.create(plan.existingSkillId, {
      files: uploadables
    });
    skillId = plan.existingSkillId;
    version = created.version;
  } else {
    const created = await client.beta.skills.create({
      files: uploadables,
      display_title: plan.skillName
    });
    skillId = created.id;
    version = created.latest_version;
  }

  const result: DeploySkillResult = {
    plan,
    applied: true,
    skillId,
    version: version ?? undefined
  };

  if (opts.attachAgentId) {
    await attachSkillToAgent(client, opts.attachAgentId, skillId);
    result.attachedToAgent = opts.attachAgentId;
  }

  return result;
}

type SkillParam =
  | { type: "anthropic"; skill_id: string }
  | { type: "custom"; skill_id: string; version?: string };

/** Pin a custom skill (version `latest`) onto an agent as a new version. */
async function attachSkillToAgent(
  client: BrainClient,
  agentId: string,
  skillId: string
): Promise<void> {
  const agent = await client.beta.agents.retrieve(agentId);
  const current = (agent.skills ?? []) as { type: string; skill_id: string; version?: string }[];
  const others: SkillParam[] = current
    .filter((s) => !(s.type === "custom" && s.skill_id === skillId))
    .map((s) =>
      s.type === "custom"
        ? { type: "custom", skill_id: s.skill_id, ...(s.version ? { version: s.version } : {}) }
        : { type: "anthropic", skill_id: s.skill_id }
    );
  const skills: SkillParam[] = [...others, { type: "custom", skill_id: skillId, version: "latest" }];
  await client.beta.agents.update(agentId, { version: agent.version, skills });
}
