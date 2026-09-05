import type { BrainSessionTemplate } from "../domain/brain";

/** The fields the admin can edit; `updatedAt` is set by the store, never by the caller. */
export type BrainSessionTemplateInput = Omit<BrainSessionTemplate, "updatedAt">;

/**
 * Port for the brain session template. Business logic depends only on this
 * interface, never on the ORM — same rule as `athleteRepository.ts`.
 */
export interface BrainConfigRepository {
  /** Read the single template, or null when the brain has never been configured. */
  get(): Promise<BrainSessionTemplate | null>;
  /** Create or replace the single template. */
  save(template: BrainSessionTemplateInput): Promise<BrainSessionTemplate>;
}
