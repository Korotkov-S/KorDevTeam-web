export type AnalyticsEvent =
  | "form_open"
  | "form_start"
  | "form_submit_success"
  | "form_submit_error"
  | "service_cta_click"
  | "telegram_click"
  | "email_click"
  | "phone_click"
  | "project_open"
  | "journal_issue_open";

export type AnalyticsPayload = Partial<Record<
  "path" | "serviceSlug" | "projectSlug" | "errorCode",
  string
>>;

type YandexMetrika = ((...args: unknown[]) => void) & {
  a?: unknown[][];
  l?: number;
};

type AnalyticsWindow = Window & typeof globalThis & {
  ym?: YandexMetrika;
  _tmr?: Array<Record<string, unknown>>;
};

const YANDEX_COUNTER_ID = 105288175;
const TOP_MAIL_COUNTER_ID = "3793508";
const YANDEX_SCRIPT_SELECTOR = 'script[data-kordev-analytics="yandex"]';
const TOP_MAIL_SCRIPT_SELECTOR = 'script[data-kordev-analytics="top-mail"]';
const ALLOWED_PAYLOAD_KEYS = ["path", "serviceSlug", "projectSlug", "errorCode"] as const;

let analyticsAccepted = false;
let testSink: ((event: AnalyticsEvent, payload: AnalyticsPayload) => void) | null = null;

function analyticsWindow(document: Document): AnalyticsWindow | null {
  return document.defaultView as AnalyticsWindow | null;
}

function removeVendorState(document: Document): void {
  document.querySelectorAll(`${YANDEX_SCRIPT_SELECTOR}, ${TOP_MAIL_SCRIPT_SELECTOR}`)
    .forEach((script) => script.remove());
  const target = analyticsWindow(document);
  if (!target) return;
  delete target.ym;
  delete target._tmr;
}

function sanitizedPayload(payload?: AnalyticsPayload): AnalyticsPayload {
  if (!payload || typeof payload !== "object") return {};
  const sanitized: AnalyticsPayload = {};
  const source = payload as Record<string, unknown>;
  for (const key of ALLOWED_PAYLOAD_KEYS) {
    if (typeof source[key] === "string") sanitized[key] = source[key] as string;
  }
  return sanitized;
}

export function loadYandexMetrika(document: Document): void {
  const target = analyticsWindow(document);
  if (!target || document.querySelector(YANDEX_SCRIPT_SELECTOR)) return;

  if (!target.ym) {
    const ym: YandexMetrika = (...args: unknown[]) => {
      (ym.a ||= []).push(args);
    };
    ym.l = Date.now();
    target.ym = ym;
  }

  const script = document.createElement("script");
  script.async = true;
  script.dataset.kordevAnalytics = "yandex";
  script.src = `https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_COUNTER_ID}`;
  document.head.appendChild(script);

  target.ym(YANDEX_COUNTER_ID, "init", {
    ssr: true,
    webvisor: false,
    clickmap: true,
    accurateTrackBounce: true,
    trackLinks: true,
  });
}

export function loadTopMailRu(document: Document): void {
  const target = analyticsWindow(document);
  if (!target || document.querySelector(TOP_MAIL_SCRIPT_SELECTOR)) return;

  target._tmr ||= [];
  target._tmr.push({
    id: TOP_MAIL_COUNTER_ID,
    type: "pageView",
    start: Date.now(),
  });

  const script = document.createElement("script");
  script.async = true;
  script.id = "tmr-code";
  script.dataset.kordevAnalytics = "top-mail";
  script.src = "https://top-fwz1.mail.ru/js/code.js";
  document.head.appendChild(script);
}

export function setAnalyticsConsent(accepted: boolean): void {
  analyticsAccepted = accepted;
  if (!accepted && typeof document !== "undefined") removeVendorState(document);
}

export function setAnalyticsSinkForTests(
  sink: ((event: AnalyticsEvent, payload: AnalyticsPayload) => void) | null,
): void {
  testSink = sink;
}

export function track(event: AnalyticsEvent, payload?: AnalyticsPayload): void {
  const safePayload = sanitizedPayload(payload);
  testSink?.(event, safePayload);
  if (!analyticsAccepted || typeof window === "undefined") return;
  const target = window as AnalyticsWindow;
  if (typeof target.ym !== "function") return;
  target.ym(YANDEX_COUNTER_ID, "reachGoal", event, safePayload);
}
