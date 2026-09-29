import React from "react";

export type AdsRecord = Record<string, any>;

export const adsInteger = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const adsMoney = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

export function adsFormatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow",
  }).format(parsed);
}

const statusLabels: Record<string, string> = {
  draft: "Черновик", awaiting_approval: "Ждёт согласования", creating: "Создаётся",
  moderation: "На модерации", scheduled: "Запланирован", running: "В работе",
  stopping: "Завершается", stopped: "Завершён", analyzed: "Проанализирован",
  rejected: "Отклонён", proposed: "Предложена", approved: "Согласована",
  archived: "Архив", winner: "Победитель", loser: "Не подтверждена", inconclusive: "Недостаточно данных",
};

export function adsStatus(value: unknown) {
  const text = String(value ?? "");
  return statusLabels[text] ?? (text || "—");
}

export function AdsPageHeader({ title, description }: { title: string; description: string }) {
  return <header><h1 className="text-3xl font-semibold">{title}</h1><p className="mt-2 max-w-4xl text-muted-foreground">{description}</p></header>;
}

export function AdsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4">{children}</div></section>;
}

export function AdsMetric({ title, value, note }: { title: string; value: React.ReactNode; note?: React.ReactNode }) {
  return <article className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p>{note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}</article>;
}

export function AdsEmpty({ children = "Данных пока нет." }: { children?: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">{children}</p>;
}

export function AdsLoading() { return <p className="p-6 text-muted-foreground">Загрузка данных…</p>; }
export function AdsError() { return <p role="alert" className="rounded-lg border border-destructive/40 p-4">Рекламные данные временно недоступны. Попробуйте обновить страницу.</p>; }
export function AdsRouteGuard({ data, children }: { data: unknown; children: React.ReactNode }) {
  return Boolean(data && typeof data === "object" && "error" in data) ? <AdsError /> : <>{children}</>;
}

export function AdsTable({ children, minWidth = "900px" }: { children: React.ReactNode; minWidth?: string }) {
  const widthClass = minWidth === "1000px" ? "min-w-[1000px]" : "min-w-[900px]";
  return <div className="overflow-x-auto"><table className={`${widthClass} w-full text-left text-sm`}>{children}</table></div>;
}

export function AdsTh({ children }: { children: React.ReactNode }) { return <th className="border-b border-border p-3 font-medium">{children}</th>; }
export function AdsTd({ children }: { children: React.ReactNode }) { return <td className="border-b border-border/70 p-3 align-top">{children}</td>; }
