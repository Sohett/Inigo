import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

/**
 * Load `<packageRoot>/.env` into process.env if it exists. Existing shell
 * variables take precedence (Node does not override them). No-op when absent.
 */
export function loadLocalEnv(packageRoot: string): void {
  const envPath = path.join(packageRoot, ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

/** Extract a human-readable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Write `data` as pretty JSON, creating parent directories as needed. */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Write text, creating parent directories as needed. */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

/**
 * Filesystem-safe slug for a display name (matches how the platform mounts
 * memory stores): lowercased, non-alphanumeric runs collapsed to a single
 * hyphen, trimmed. Falls back to `fallback` when the result is empty.
 */
export function slugify(name: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
