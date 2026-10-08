import React from "react";
import { Form, NavLink } from "react-router";

import { GEO_PLATFORMS, GEO_RUN_MODES } from "../../server/geo-monitoring/contracts";
import type { GeoView } from "./geo-read.server";
import { decimal, formatDate, integer } from "./seo-shared";

export const geoViewLabels: Record<GeoView, string> = {
  overview: "Сводка", platforms: "Платформы", prompts: "Вопросы", entities: "Сущности",
  sources: "Источники", evidence: "Доказательства", traffic: "AI-трафик", promotion: "Продвижение",
};
export const platformLabels: Record<string, string> = {
  yandex_alice: "Яндекс Алиса", chatgpt_search: "ChatGPT Search", google_ai: "Google AI", bing_copilot: "Bing Copilot",
};
export const modeLabels: Record<string, string> = { official_report: "Официальный отчёт", live_ui: "Живой интерфейс", api_probe: "API-проверка" };

type FilterValues = { from: string; to: string; platform: string | null; mode: string | null; language: string | null;
  region: string | null; surface?: string | null; sessionPersonalized?: boolean | null; topicId?: string | null };

export function GeoTabs({ active, filters }: { active: GeoView; filters?: FilterValues }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) if (value !== null && value !== undefined && value !== "") query.set(key === "topicId" ? "topic" : key, String(value));
  return <nav aria-label="Разделы AI-видимости" className="flex max-w-full flex-wrap gap-2 rounded-xl border border-border bg-card p-2">
    {(Object.entries(geoViewLabels) as Array<[GeoView, string]>).map(([view, label]) => <NavLink key={view}
      to={`/admin/seo/ai-visibility/?${new URLSearchParams([...query, ["view", view]])}`} aria-current={view === active ? "page" : undefined}
      className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${view === active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</NavLink>)}
  </nav>;
}

export function GeoFilters({ filters, view }: { filters: FilterValues; view: GeoView }) {
  return <Form method="get" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6">
    <input type="hidden" name="view" value={view} />
    {filters.topicId ? <input type="hidden" name="topic" value={filters.topicId} /> : null}
    <label className="grid gap-1 text-sm"><span>С даты</span><input type="date" name="from" defaultValue={filters.from} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
    <label className="grid gap-1 text-sm"><span>По дату</span><input type="date" name="to" defaultValue={filters.to} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
    <label className="grid gap-1 text-sm"><span>AI-платформа</span><select name="platform" defaultValue={filters.platform ?? ""} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все</option>{GEO_PLATFORMS.map((platform) => <option key={platform} value={platform}>{platformLabels[platform]}</option>)}</select></label>
    <label className="grid gap-1 text-sm"><span>Режим проверки</span><select name="mode" defaultValue={filters.mode ?? ""} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все</option>{GEO_RUN_MODES.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label>
    <label className="grid gap-1 text-sm"><span>Язык</span><input name="language" defaultValue={filters.language ?? ""} placeholder="ru" className="rounded-lg border border-input bg-background px-3 py-2" /></label>
    <label className="grid gap-1 text-sm"><span>Регион</span><input name="region" defaultValue={filters.region ?? ""} placeholder="Россия" className="rounded-lg border border-input bg-background px-3 py-2" /></label>
    <label className="grid gap-1 text-sm"><span>Поверхность</span><input name="surface" defaultValue={filters.surface ?? ""} maxLength={120} placeholder="alice_web" className="rounded-lg border border-input bg-background px-3 py-2" /></label>
    <label className="grid gap-1 text-sm"><span>Персонализация</span><select name="sessionPersonalized" defaultValue={filters.sessionPersonalized === null || filters.sessionPersonalized === undefined ? "" : String(filters.sessionPersonalized)} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все условия отдельно</option><option value="true">Персонализировано</option><option value="false">Неперсонализировано</option></select></label>
    <button className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Применить</button>
  </Form>;
}

export function GeoPanel({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{title}</h2>{help ? <abbr title={help} aria-label={`${title}: ${help}`} className="cursor-help rounded-full border border-border px-1.5 text-xs no-underline">?</abbr> : null}</div><div className="mt-4 min-w-0">{children}</div></section>;
}

export function GeoTable({ children, minWidth = "1000px" }: { children: React.ReactNode; minWidth?: string }) {
  return <div className="max-w-full overflow-x-auto"><table className="text-left text-sm" style={{ minWidth }}>{children}</table></div>;
}

export function HelpHeader({ label, help }: { label: string; help: string }) {
  return <th className="p-3 align-bottom"><span>{label}</span> <abbr title={help} aria-label={`${label}: ${help}`} className="cursor-help rounded-full border border-border px-1.5 text-xs no-underline">?</abbr></th>;
}

export function GeoRateCard({ title, rate, formula }: { title: string; rate: { numerator: number; denominator: number; value: number | null }; formula: string }) {
  return <article className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{rate.value === null ? "—" : `${decimal.format(rate.value * 100)}%`}</p><p className="mt-1 text-sm">{integer.format(rate.numerator)} из {integer.format(rate.denominator)}</p><p className="mt-2 text-xs text-muted-foreground">Формула: {formula}; числитель ÷ знаменатель.</p></article>;
}

export function Empty({ children }: { children: React.ReactNode }) { return <p className="rounded-lg bg-muted p-4 text-muted-foreground">{children}</p>; }
export { formatDate };
