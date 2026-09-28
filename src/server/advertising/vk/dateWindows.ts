import { VkAdsError } from "./errors";

export type VkAdsDateWindow = { dateFrom: string; dateTo: string };

const dayMilliseconds = 86_400_000;
const moscowDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function invalid(): never {
  throw new VkAdsError("ads_vk_contract_invalid");
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return invalid();
  return parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function moscowCalendarDate(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return invalid();
  const parts = Object.fromEntries(moscowDate.formatToParts(now).map((part) => [part.type, part.value]));
  const value = `${parts.year}-${parts.month}-${parts.day}`;
  parseDateOnly(value);
  return value;
}

export function dailyLookbackWindow(now: Date): VkAdsDateWindow {
  const dateTo = moscowCalendarDate(now);
  const end = parseDateOnly(dateTo);
  return {
    dateFrom: formatDate(new Date(end.getTime() - 6 * dayMilliseconds)),
    dateTo,
  };
}

export function splitDateWindows(dateFrom: string, dateTo: string, maxDays: number): VkAdsDateWindow[] {
  if (!Number.isSafeInteger(maxDays) || maxDays < 1 || maxDays > 366) return invalid();
  const start = parseDateOnly(dateFrom);
  const end = parseDateOnly(dateTo);
  if (start > end) return invalid();
  const windows: VkAdsDateWindow[] = [];
  for (let cursor = start.getTime(); cursor <= end.getTime();) {
    const windowEnd = Math.min(end.getTime(), cursor + (maxDays - 1) * dayMilliseconds);
    windows.push({ dateFrom: formatDate(new Date(cursor)), dateTo: formatDate(new Date(windowEnd)) });
    cursor = windowEnd + dayMilliseconds;
  }
  return windows;
}
