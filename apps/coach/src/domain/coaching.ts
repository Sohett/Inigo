import type {
  AdaptationTrigger, AthleteConstraints, AthleteStatus, CoachingTargets, GoalPriority,
  GoalStatus, GoalType, PhaseType, PlanAuthor, PlanStatus, Sex, Sport, ThresholdSource,
  WeeklyTarget, Zone
} from "@inigo/db";

/* ---------- Modèles métier (contrat de sortie des tools) ---------- */

export interface ProfileDetails {
  birthDate: string | null; // YYYY-MM-DD
  sex: Sex | null;
  heightCm: string | null;
  weightKg: string | null;
  weightTargetKg: string | null;
  restingHr: number | null;
  maxHr: number | null;
  constraints: AthleteConstraints | null;
  constraintsNotes: string | null;
  healthNotes: string | null;
  coachingTargets: CoachingTargets | null;
}
export interface CoachProfile {
  athleteId: string;
  displayName: string;
  timezone: string;
  locale: string;
  status: AthleteStatus;
  profile: ProfileDetails | null;
}

export interface Threshold {
  sport: Sport;
  effectiveDate: string; // YYYY-MM-DD
  ftpWatts: number | null;
  thresholdHr: number | null;
  maxHr: number | null;
  thresholdPaceSPerKm: number | null;
  powerZones: Zone[] | null;
  hrZones: Zone[] | null;
  source: ThresholdSource | null;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  type: GoalType | null;
  targetDate: string | null; // YYYY-MM-DD
  priority: GoalPriority | null;
  status: GoalStatus;
  intervalsEventId: string | null;
}

export interface PlanBlock {
  name: string | null;
  phaseType: PhaseType | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  focus: string | null;
  orderIndex: number;
  weeklyTargets: WeeklyTarget[] | null;
}
export interface TrainingPlan {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: PlanStatus;
  createdBy: PlanAuthor | null;
  goalId: string | null;
  rationale: string | null;
  blocks: PlanBlock[];
}

export interface AdaptationLogEntry {
  id: string;
  occurredAt: string; // ISO 8601
  summary: string;
  author: string | null;
  trigger: AdaptationTrigger | null;
  detail: Record<string, unknown> | null;
  relatedWeek: string | null; // YYYY-MM-DD
}

/* ---------- Inputs (écritures) ---------- */

export interface ProfilePatch {
  weightTargetKg?: string;
  constraints?: AthleteConstraints;
  constraintsNotes?: string;
  healthNotes?: string;
  coachingTargets?: CoachingTargets;
}
export interface AdaptationLogInput {
  summary: string;
  author?: string;
  trigger?: AdaptationTrigger;
  detail?: Record<string, unknown>;
  relatedWeek?: string;
}
export interface GoalInput {
  id?: string;
  title?: string;
  description?: string;
  type?: GoalType;
  targetDate?: string;
  priority?: GoalPriority;
  status?: GoalStatus;
  intervalsEventId?: string;
}
export interface PlanBlockInput {
  name?: string;
  phaseType?: PhaseType;
  startDate: string;
  endDate: string;
  focus?: string;
  weeklyTargets?: WeeklyTarget[];
}
export interface TrainingPlanInput {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: PlanStatus;
  goalId?: string | null;
  rationale?: string;
  createdBy?: PlanAuthor;
  blocks: PlanBlockInput[];
}
