import { track } from "../lib/analytics";

export type YandexGoalName =
  | "journal_issue_open"
  | "journal_read_start"
  | "journal_download"
  | "journal_contact";

export type YandexGoalParams = Record<string, string | number | boolean>;

/** @deprecated Analytics loading is owned by AnalyticsScripts after consent. */
export function scheduleYandexMetrika() {
  // Kept temporarily for callers compiled against the previous interface.
}

export function trackYandexGoal(goal: YandexGoalName, _params?: YandexGoalParams) {
  const path = typeof window === "undefined" ? undefined : window.location.pathname;
  if (goal === "journal_issue_open") {
    track("journal_issue_open", path ? { path } : undefined);
  } else if (goal === "journal_contact") {
    track("telegram_click", path ? { path } : undefined);
  }
}
