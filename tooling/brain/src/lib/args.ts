/**
 * Minimal, unambiguous CLI argument helpers.
 *
 * Convention: boolean flags are bare (`--apply`, `--attach`); options carry a
 * value in `--key=value` form only. Everything else is a positional. This avoids
 * the `--key value` vs `--key <positional>` ambiguity entirely.
 */

/** True when a bare boolean flag (`--name`) is present. */
export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

/** Value of a `--name=value` option, or undefined when absent. */
export function getOption(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

/** All non-flag arguments, in order. */
export function positionals(argv: readonly string[]): string[] {
  return argv.filter((a) => !a.startsWith("--"));
}
