/**
 * Write posture: read-first, writes gated.
 *
 * Every mutating operation on the live brain (new agent version, vault
 * credential, skill deploy) must be explicitly confirmed with `--apply`.
 * Without it, ops run in dry-run mode: they compute and print the plan but never
 * call a write endpoint.
 */

export class WriteBlockedError extends Error {
  constructor(action: string) {
    super(
      `Écriture bloquée : « ${action} » nécessite le flag --apply (mode lecture par défaut). ` +
        `Relance la commande avec --apply pour confirmer.`
    );
    this.name = "WriteBlockedError";
  }
}

/** Throw unless writes were explicitly authorized. */
export function ensureApply(apply: boolean, action: string): void {
  if (!apply) throw new WriteBlockedError(action);
}
