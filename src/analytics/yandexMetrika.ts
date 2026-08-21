const COUNTER_ID = 105288175;

export type YandexGoalName =
  | "journal_issue_open"
  | "journal_read_start"
  | "journal_download"
  | "journal_contact";

export type YandexGoalParams = Record<string, string | number | boolean>;

type YandexMetrika = ((...args: unknown[]) => void) & {
  a?: unknown[][];
  l?: number;
};

declare global {
  interface Window {
    ym?: YandexMetrika;
  }
}

function loadYandexMetrika() {
  if (window.ym || document.querySelector('script[data-yandex-metrika]')) return;

  const ym: YandexMetrika = (...args: unknown[]) => {
    (ym.a ||= []).push(args);
  };
  ym.l = Date.now();
  window.ym = ym;

  const script = document.createElement("script");
  script.async = true;
  script.dataset.yandexMetrika = "true";
  script.src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`;
  document.head.appendChild(script);

  ym(COUNTER_ID, "init", {
    ssr: true,
    webvisor: false,
    clickmap: true,
    ecommerce: "dataLayer",
    accurateTrackBounce: true,
    trackLinks: true,
  });
}

export function scheduleYandexMetrika() {
  if (typeof window === "undefined" || window.location.hostname !== "kordev.team") return;

  const schedule = () => {
    const idleCallback = (
      window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      }
    ).requestIdleCallback;

    if (idleCallback) {
      idleCallback(loadYandexMetrika, { timeout: 4_000 });
    } else {
      window.setTimeout(loadYandexMetrika, 2_500);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

export function trackYandexGoal(goal: YandexGoalName, params?: YandexGoalParams) {
  if (typeof window === "undefined" || window.location.hostname !== "kordev.team") return;

  // Create the queue immediately so a goal is not lost if the deferred tag has
  // not loaded yet. The script itself remains async and does not block the page.
  loadYandexMetrika();
  window.ym?.(COUNTER_ID, "reachGoal", goal, params);
}
