import React from "react";
import { Form, Link, useSearchParams } from "react-router";
import { formatDate, integer, type RankControl, type RankControlCell } from "./seo-shared";

const buckets = [
  { id: "all", title: "Все запросы", note: "Уникальные ключи, не число проверок" },
  { id: "top3", title: "В топ-3", note: "Позиции 1–3" },
  { id: "top10", title: "В топ-10", note: "включая топ-3" },
  { id: "top30", title: "В топ-30", note: "включая топ-10" },
  { id: "top100", title: "В топ-100", note: "включая топ-30" },
  { id: "outside", title: "Не найдено", note: "В проверенной выдаче; глубина — в строке" },
  { id: "unchecked", title: "Не проверено", note: "Нет сохранённого замера" },
] as const;
type Bucket = typeof buckets[number]["id"];
function belongs(cell: RankControlCell | null, bucket: Bucket) {
  if (bucket === "all") return true;
  if (bucket === "unchecked") return cell === null;
  if (bucket === "outside") return cell?.status === "not_found";
  const limit = { top3: 3, top10: 10, top30: 30, top100: 100 }[bucket];
  return cell?.status === "found" && cell.position !== null && cell.position <= limit;
}
function resultUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && ["kordev.team", "www.kordev.team"].includes(url.hostname)
      && !url.username && !url.password ? url : null;
  } catch { return null; }
}
const normalizePath = (path: string) => path.replace(/\/+$/u, "") || "/";

export function RankQueryDrilldown({ control }: { control: RankControl }) {
  const [search] = useSearchParams();
  const region = control.regions.find(r => r.code === search.get("rankRegion"))
    ?? control.regions.find(r => r.code === "ru") ?? control.regions[0];
  const device = search.get("rankDevice") === "mobile" ? "mobile" : "desktop";
  const bucket: Bucket = buckets.find(b => b.id === search.get("rankBucket"))?.id ?? "all";
  const query = (search.get("rankQuery") ?? "").trim().slice(0, 200);
  const regionCode = region?.code ?? "";
  const selected = control.rows.filter(row => row.queryText.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")))
    .map(row => ({ row, cell: row.checks[regionCode]?.[device] ?? null }));
  const counts = Object.fromEntries(buckets.map(b => [b.id, selected.filter(x => belongs(x.cell, b.id)).length]));
  const visible = selected.filter(x => belongs(x.cell, bucket)).sort((a, b) => {
    const score = (cell: RankControlCell | null) => cell?.status === "found" ? cell.position! : cell ? 1_000_000 : 1_000_001;
    return score(a.cell) - score(b.cell) || Number(a.cell === null) - Number(b.cell === null)
      || a.row.queryText.localeCompare(b.row.queryText, "ru");
  });
  const dates = [...new Set(selected.flatMap(x => x.cell ? [x.cell.checkDate] : []))].sort();
  function href(next: Bucket) {
    const params = new URLSearchParams(search);
    params.delete("cursor");
    params.set("rankRegion", regionCode); params.set("rankDevice", device); params.set("rankBucket", next);
    if (query) params.set("rankQuery", query); else params.delete("rankQuery");
    return `/admin/seo/positions/?${params}#rank-queries`;
  }
  const hidden = [...search.entries()].filter(([key]) => !["rankRegion", "rankDevice", "rankQuery", "cursor"].includes(key));

  return <section data-rank-drilldown className="space-y-4 rounded-xl border border-border bg-card p-5">
    <div><h2 className="text-xl font-semibold">Запросы и контрольные позиции</h2>
      <p className="mt-2">Срез: {region?.displayName ?? "Регион не настроен"} · {device === "mobile" ? "Смартфон" : "Компьютер"} · Яндекс Search API.</p>
      <p className="mt-1 text-sm text-muted-foreground">{dates.length ? `Даты сохранённых замеров: ${formatDate(dates[0])}${dates.length > 1 ? ` — ${formatDate(dates.at(-1)!)}` : ""}.` : "Нет сохранённых замеров в этом срезе."} Это не позиции в реальном времени. Дата каждого запроса указана в строке.</p>
    </div>
    <Form method="get" key={`${regionCode}:${device}:${query}:${bucket}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {hidden.map(([name, value], i) => <input key={`${name}:${i}`} type="hidden" name={name} value={value} />)}
      <label className="grid gap-1 text-sm">Регион контрольного замера<select name="rankRegion" defaultValue={regionCode} className="rounded-lg border border-input bg-background p-2">
        {control.regions.map(r => <option value={r.code} key={r.id}>{r.displayName}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Устройство контрольного замера<select name="rankDevice" defaultValue={device} className="rounded-lg border border-input bg-background p-2"><option value="desktop">Компьютер</option><option value="mobile">Смартфон</option></select></label>
      <label className="grid gap-1 text-sm">Поиск по запросу<input name="rankQuery" defaultValue={query} maxLength={200} placeholder="Например, CRM" className="rounded-lg border border-input bg-background p-2" /></label>
      <button className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Показать запросы</button>
    </Form>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{buckets.map(b => <Link key={b.id} to={href(b.id)} data-rank-bucket={b.id}
      aria-current={bucket === b.id ? "true" : undefined} className={`rounded-xl border p-4 hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${bucket === b.id ? "border-primary bg-primary/5" : "border-border"}`}>
      <span className="block text-sm text-muted-foreground">{b.title}</span><span data-rank-count className="mt-1 block text-2xl font-semibold">{integer.format(counts[b.id])}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{b.note}</span></Link>)}</div>
    <p className="text-sm text-muted-foreground">Счётчики относятся к выбранному региону и устройству{query ? " и учитывают поиск по запросу" : ""}. Группы топ-3, топ-10, топ-30 и топ-100 вложены друг в друга, их нельзя складывать. «Не проверено» не означает «вне топ-100».</p>
    <div id="rank-queries" className="scroll-mt-4 overflow-x-auto"><p className="mb-3 text-sm" aria-live="polite">Показано {integer.format(visible.length)} из {integer.format(selected.length)} запросов · {buckets.find(b => b.id === bucket)!.title}</p>
      <table aria-label="Запросы выбранного среза" className="min-w-[900px] w-full text-left text-sm">
        <thead><tr>{["Запрос", "Контрольная позиция", "Целевая страница", "Найденная страница", "Дата замера"].map(title => <th className="p-3" key={title}>{title}</th>)}</tr></thead>
        <tbody>{visible.map(({ row, cell }) => {
          const found = resultUrl(cell?.resultUrl ?? null);
          const mismatch = found && row.targetPath && normalizePath(found.pathname) !== normalizePath(row.targetPath);
          return <tr key={row.queryId} data-query-id={row.queryId} className="border-t border-border align-top">
            <td className="max-w-[300px] p-3 font-medium">{row.queryText}</td>
            <td className="p-3">{!cell ? "Не проверено" : cell.status === "found" ? `позиция ${integer.format(cell.position!)}` : `Вне проверенного топ-${integer.format(cell.resultLimit)}`}</td>
            <td className="max-w-[240px] break-words p-3">{row.targetPath && /^\/(?!\/)/u.test(row.targetPath) ? <a className="underline" href={row.targetPath} target="_blank" rel="noreferrer">{row.targetPath}</a> : "Не назначена"}</td>
            <td className="max-w-[280px] break-words p-3">{found ? <><a data-found-url className="underline" href={found.href} target="_blank" rel="noreferrer">{found.pathname}{found.search}</a>{mismatch ? <p className="mt-1 text-xs text-amber-700">Другая страница — не целевая</p> : null}</> : "—"}</td>
            <td className="whitespace-nowrap p-3">{cell ? formatDate(cell.checkDate) : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
      {!visible.length ? <p className="py-5 text-muted-foreground">В выбранной группе запросов нет. Выберите другую группу или измените поиск.</p> : null}
    </div>
    <p className="text-xs text-muted-foreground">Просмотр, фильтры и переходы по счётчикам используют сохранённые данные: не запускают платные проверки и не меняют семантическое ядро.</p>
  </section>;
}
