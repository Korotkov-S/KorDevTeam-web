import type { EffectSource } from "./effects";

export const journalStates = ["unchecked", "waiting", "improved", "declined", "no_material_change", "insufficient_data", "confounded", "incompatible", "not_applicable"] as const;
export type JournalState = typeof journalStates[number];
export type ChangeJournalFilters = { pagePath?: string; dateFrom?: string; dateTo?: string; timeZone?: "Europe/Moscow";
  changeId?: string; queryText?: string; changeType?: "content" | "metadata" | "structure" | "interlinking" | "technical" | "other";
  source?: EffectSource; effectStatus?: JournalState; sort?: "newest" | "oldest" };
