import React from "react";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

import { readAdminAuthConfig } from "../../server/auth/config";
import { getAdminAuthService } from "../../server/auth/runtime";
import { getGeoMonitoringService } from "../../server/geo-monitoring/runtime";
import { createGeoAdminAction } from "./geo-actions.server";
import { createGeoSectionLoader, type GeoView } from "./geo-read.server";
import { Empty, GeoFilters, GeoPanel, GeoRateCard, GeoTable, GeoTabs, HelpHeader, formatDate, modeLabels, platformLabels } from "./geo-shared";
import { adminRouteHeaders } from "./headers";
import { PageHeader, integer, useAdminCsrfToken } from "./seo-shared";

type Filters = { from: string; to: string; platform: string | null; mode: string | null; language: string | null; region: string | null; topicId: string | null };
type Page<T> = { items: T[]; nextCursor: string | null };
type Rate = { numerator: number; denominator: number; value: number | null };
type Overview = { period: { from: string; to: string }; mentionRate: Rate; citationRate: Rate; citationShare: Rate;
  ownedSourceCoverage: Rate; shareOfVoice: Rate; sample: { runs: number; prompts: number; observations: number; requiredRepetitions: number };
  actionMatrix: Record<"strong" | "strengthenSource" | "restoreBrand" | "attention", { prompts: number; promptIds: string[] }>;
  freshness: { platforms: Array<{ platform: string; run: null | { status: string; startedAt: string | Date; completedAt: string | Date | null; errorCode: string | null } }>;
    crawler: { lastCheckedAt: string | Date | null; checks: number; passed: number; failed: number };
    referrals: { lastImportedAt: string | Date | null } } };
type Observation = { id: string; promptId: string; observedAt: string | Date; platform: string; mode: string; region: string; language: string;
  mentioned: boolean; linked: boolean; cited: boolean; sourceOrder: number | null; responseExcerpt: string; snapshotTruncated: boolean;
  modelName: string | null; sourceCount: number };
type Prompt = { id: string; promptText: string; topicId: string; tags: string[]; category: string; status: "candidate" | "active" | "archived";
  priority: number; language: string; region: string; targetPath: string | null; source: string; updatedAt: string | Date };
type Entity = { id: string; canonicalName: string; type: "owned" | "competitor"; aliases: string[]; domains: string[];
  status: "candidate" | "active" | "archived"; updatedAt: string | Date };
type Citation = { id?: string; observationId?: string; url: string; hostname: string; title?: string | null; sourceOrder: number;
  isOwned: boolean; category: string; localPath?: string | null; createdAt?: string | Date; platform?: string; mode?: string };
type Fanout = { observationId: string; position: number; queryText: string; source: string; platform?: string; mode?: string };
type Referral = { observationDate: string; platform: string; users: number; newUsers: number; visits: number; pageviews: number;
  landingPath: string; importedAt: string | Date };
type CrawlerCheck = { id: string; checkDate: string; target: string; bot: string; status: "pass" | "fail" | "unavailable";
  reasonCode: string | null; httpStatus: number | null; checkedAt: string | Date };
type Experiment = { id: string; pagePath: string; actionType: string; hypothesis: string; platform: string; mode: string; language: string;
  region: string; primaryMetric: string; direction: string; minimumDelta: string | number; evaluationWindows: number[]; expectedSignal: string;
  status: string; baseline: Record<string, unknown>; evaluationResults: Record<string, unknown>; verdict: string; seoChangeId: string | null;
  implementedAt: string | Date | null; createdAt: string | Date; updatedAt: string | Date };
type Evidence = { observation: Observation & { responseSnapshot: string }; mentions: Array<{ entityId: string; canonicalName: string; type: string;
  status: string; firstMentionOrder: number; recommended: boolean; sentiment: string }>; citations: Citation[]; fanoutQueries: Fanout[] };

export type GeoAdminLoaderData = { view: GeoView; filters: Filters; overview?: Overview; observations?: Page<Observation>;
  prompts?: Page<Prompt>; entities?: Page<Entity>; citations?: Page<Citation>; fanout?: Page<Fanout>; evidence?: Evidence;
  referrals?: Page<Referral>; crawlerChecks?: Page<CrawlerCheck>; experiments?: Page<Experiment>; nextCursor?: string | null };

const statusLabels: Record<string, string> = { candidate: "Кандидат", active: "Активен", archived: "Архив",
  proposed: "Предложен", approved: "Утверждён", completed: "Завершён", cancelled: "Отменён" };
const categoryLabels: Record<string, string> = { commercial: "Коммерческий", informational: "Информационный", comparison: "Сравнение", local: "Локальный", brand: "Брендовый" };
const yesNo = (value: boolean) => value ? "Да" : "Нет";

export const meta: MetaFunction = () => [{ title: "AI-видимость и GEO | KorDevTeam" }];

function OverviewView({ overview }: { overview?: Overview }) {
  if (!overview) return <Empty>Данных ещё нет. Первый сопоставимый отчёт появится после успешного полного запуска по трём повторениям каждого вопроса.</Empty>;
  const matrix = [
    ["Упомянут и процитирован", overview.actionMatrix.strong, "Сохранять качество ответа и подтверждать эффект."],
    ["Усилить источник", overview.actionMatrix.strengthenSource, "Бренд упомянут, но AI не ссылается на наш материал."],
    ["Вернуть бренд", overview.actionMatrix.restoreBrand, "Страница цитируется, но бренд не назван в ответе."],
    ["Требует внимания", overview.actionMatrix.attention, "Бренда и собственной цитаты нет, конкурент присутствует."],
  ] as const;
  return <div className="space-y-6">
    <PageHeader title="AI-видимость — сводка" description={`Проверяем, упоминают ли AI-системы KorDevTeam, цитируют ли сайт и какие страницы служат источниками. Период: ${formatDate(overview.period.from)} — ${formatDate(overview.period.to)}.`} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <GeoRateCard title="Упоминания" rate={overview.mentionRate} formula="ответы с упоминанием ÷ полные наблюдения" />
      <GeoRateCard title="Цитирование" rate={overview.citationRate} formula="ответы с цитатой ÷ полные наблюдения" />
      <GeoRateCard title="Доля собственных источников" rate={overview.citationShare} formula="ссылки на kordev.team ÷ все ссылки" />
      <GeoRateCard title="Покрытие целевой страницы" rate={overview.ownedSourceCoverage} formula="цитаты целевой страницы ÷ собственные цитаты" />
      <GeoRateCard title="Share of Voice" rate={overview.shareOfVoice} formula="упоминания бренда ÷ упоминания бренда и подтверждённых конкурентов" />
    </div>
    <GeoPanel title="Достаточность выборки" help="В расчёт входят только успешные запуски, где каждый контрольный вопрос проверен ровно три раза.">
      <p>{integer.format(overview.sample.observations)} наблюдений · {integer.format(overview.sample.prompts)} вопросов · {integer.format(overview.sample.runs)} запусков · требуется {overview.sample.requiredRepetitions} повторения.</p>
    </GeoPanel>
    <GeoPanel title="Свежесть источников" help="Отсутствие запуска показывается как «нет данных», а не как нулевая AI-видимость.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{overview.freshness.platforms.map(({ platform, run }) => <article key={platform} className="rounded-lg border border-border p-3"><h3 className="font-semibold">{platformLabels[platform] ?? platform}</h3><p className="mt-1 text-sm">{run ? `${statusLabels[run.status] ?? run.status} · ${formatDate(run.completedAt ?? run.startedAt)}` : "Нет данных"}</p></article>)}</div>
      <p className="mt-3 text-sm">Crawler health: {overview.freshness.crawler.checks ? `${overview.freshness.crawler.passed} успешно, ${overview.freshness.crawler.failed} с ошибкой; обновлено ${formatDate(overview.freshness.crawler.lastCheckedAt)}` : "нет данных"}. AI-referral: {overview.freshness.referrals.lastImportedAt ? `обновлено ${formatDate(overview.freshness.referrals.lastImportedAt)}` : "нет данных"}.</p>
    </GeoPanel>
    <GeoPanel title="Матрица действий" help="Подсказывает следующий тип работы, но не меняет страницы автоматически.">
      <div className="grid gap-3 md:grid-cols-2">{matrix.map(([title, bucket, explanation]) => <article key={title} className="rounded-lg border border-border p-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-2xl font-semibold">{integer.format(bucket.prompts)}</p><p className="mt-1 text-sm text-muted-foreground">{explanation}</p></article>)}</div>
    </GeoPanel>
  </div>;
}

function PlatformsView({ observations }: { observations?: Page<Observation> }) {
  const rows = observations?.items ?? [];
  return <div className="space-y-6"><PageHeader title="Платформы и режимы" description="Последние проверенные ответы по AI-платформам. Список содержит выдержку, но не полный снимок ответа." />
    <GeoPanel title="Наблюдения" help="Живой интерфейс и официальный отчёт нельзя смешивать: условия получения ответа отличаются.">{rows.length ? <GeoTable minWidth="1200px"><thead><tr><HelpHeader label="Дата" help="Момент фиксации ответа" /><th className="p-3">Платформа</th><th className="p-3">Режим</th><th className="p-3">Регион / язык</th><th className="p-3">Упомянут</th><th className="p-3">Ссылка</th><th className="p-3">Цитата</th><th className="p-3">Источники</th><th className="p-3">Выдержка</th><th className="p-3">Доказательство</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-3">{formatDate(row.observedAt)}</td><td className="p-3">{platformLabels[row.platform] ?? row.platform}</td><td className="p-3">{modeLabels[row.mode] ?? row.mode}</td><td className="p-3">{row.region} · {row.language}</td><td className="p-3">{yesNo(row.mentioned)}</td><td className="p-3">{yesNo(row.linked)}</td><td className="p-3">{yesNo(row.cited)}</td><td className="p-3">{integer.format(row.sourceCount)}</td><td className="max-w-[360px] p-3">{row.responseExcerpt || "Нет выдержки"}</td><td className="p-3"><Link className="underline" to={`/admin/seo/ai-visibility/?view=evidence&observation=${row.id}`}>Открыть</Link></td></tr>)}</tbody></GeoTable> : <Empty>Наблюдений за выбранный период нет. Это не означает, что сайт отсутствует в AI-выдаче: проверка ещё не зафиксирована.</Empty>}</GeoPanel>
  </div>;
}

function PromptsView({ prompts, csrfToken }: { prompts?: Page<Prompt>; csrfToken: string }) {
  const rows = prompts?.items ?? [];
  return <div className="space-y-6"><PageHeader title="Темы и контрольные вопросы" description="Управляйте проверяемыми вопросами, их приоритетом и целевой страницей. Изменение вопроса не редактирует контент сайта." />
    <GeoPanel title="Каталог вопросов" help="Активные вопросы участвуют в запусках, кандидаты ждут проверки, архивные сохраняют историю.">{rows.length ? <GeoTable minWidth="1250px"><thead><tr><HelpHeader label="Контрольный вопрос" help="Формулировка, которую вводят в AI-систему" /><th className="p-3">Категория</th><th className="p-3">Регион / язык</th><th className="p-3">Теги</th><HelpHeader label="Целевая страница" help="Страница, которую ожидаем увидеть среди источников" /><HelpHeader label="Приоритет" help="Чем выше число, тем раньше вопрос попадает в ограниченный запуск" /><th className="p-3">Статус</th><th className="p-3">Обновлён</th><th className="p-3">Действие</th></tr></thead><tbody>{rows.map((row) => { const formId = `geo-prompt-${row.id}`; return <tr key={row.id} className="border-t border-border"><td className="max-w-[360px] p-3 align-top font-medium">{row.promptText}</td><td className="p-3 align-top">{categoryLabels[row.category] ?? row.category}</td><td className="p-3 align-top">{row.region} · {row.language}</td><td className="p-3 align-top">{row.tags.join(", ") || "—"}</td><td className="p-3 align-top"><input form={formId} name="targetPath" defaultValue={row.targetPath ?? ""} className="w-[240px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-3 align-top"><input form={formId} name="priority" type="number" min="0" max="1000" defaultValue={row.priority} className="w-[90px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-3 align-top"><select form={formId} name="status" defaultValue={row.status} className="rounded border border-input bg-background px-2 py-1"><option value="candidate">Кандидат</option><option value="active">Активен</option><option value="archived">Архив</option></select></td><td className="p-3 align-top">{formatDate(row.updatedAt)}</td><td className="p-3 align-top"><Form id={formId} method="post"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="update-prompt" /><input type="hidden" name="id" value={row.id} /><button className="rounded bg-primary px-3 py-1 text-primary-foreground">Сохранить</button></Form></td></tr>; })}</tbody></GeoTable> : <Empty>Контрольных вопросов пока нет. Кандидаты можно добавлять через MCP, после чего активировать здесь.</Empty>}</GeoPanel>
  </div>;
}

function EntitiesView({ entities, csrfToken }: { entities?: Page<Entity>; csrfToken: string }) {
  const rows = entities?.items ?? [];
  return <div className="space-y-6"><PageHeader title="Бренд и конкуренты" description="Сущности помогают отличать упоминание KorDevTeam от конкурентов. В Share of Voice входят только подтверждённые активные сущности." />
    <GeoPanel title="Справочник сущностей" help="Кандидат-конкурент не влияет на метрики, пока администратор не подтвердит его как активного.">{rows.length ? <GeoTable minWidth="1200px"><thead><tr><th className="p-3">Название</th><th className="p-3">Тип</th><th className="p-3">Псевдонимы</th><th className="p-3">Домены</th><th className="p-3">Статус</th><th className="p-3">Интерпретация</th><th className="p-3">Обновлён</th><th className="p-3">Действие</th></tr></thead><tbody>{rows.map((row) => { const formId = `geo-entity-${row.id}`; return <tr key={row.id} className="border-t border-border"><td className="p-3"><input form={formId} name="canonicalName" defaultValue={row.canonicalName} className="w-[220px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-3"><select form={formId} name="type" defaultValue={row.type} className="rounded border border-input bg-background px-2 py-1"><option value="owned">Наш бренд</option><option value="competitor">Конкурент</option></select></td><td className="p-3"><textarea form={formId} name="aliases" defaultValue={row.aliases.join("\n")} rows={2} className="w-[220px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-3"><textarea form={formId} name="domains" defaultValue={row.domains.join("\n")} rows={2} className="w-[220px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-3"><select form={formId} name="status" defaultValue={row.status} className="rounded border border-input bg-background px-2 py-1"><option value="candidate">Кандидат</option><option value="active">Активен</option><option value="archived">Архив</option></select></td><td className="p-3">{row.status === "active" ? "Подтверждённая сущность" : row.status === "candidate" ? "Кандидат — не участвует в Share of Voice" : "Архив — сохраняет историю"}</td><td className="p-3">{formatDate(row.updatedAt)}</td><td className="p-3"><Form id={formId} method="post"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="update-entity" /><input type="hidden" name="id" value={row.id} /><button className="rounded bg-primary px-3 py-1 text-primary-foreground">Сохранить</button></Form></td></tr>; })}</tbody></GeoTable> : <Empty>Сущностей пока нет. Сначала добавьте собственный бренд и домен, затем подтверждённых конкурентов.</Empty>}</GeoPanel>
  </div>;
}

function SourcesView({ citations, fanout, crawlerChecks }: { citations?: Page<Citation>; fanout?: Page<Fanout>; crawlerChecks?: Page<CrawlerCheck> }) {
  const links = citations?.items ?? []; const queries = fanout?.items ?? [];
  return <div className="space-y-6"><PageHeader title="Источники и страницы" description="Показывает, какие сайты и страницы AI использует как доказательства, а также какие дополнительные запросы раскрывает интерфейс." />
    <GeoPanel title="Цитируемые источники" help="Собственный источник — ссылка на kordev.team; его место фиксируется в порядке источников ответа.">{links.length ? <GeoTable minWidth="1100px"><thead><tr><th className="p-3">Дата фиксации</th><th className="p-3">Платформа / режим</th><th className="p-3">Источник</th><th className="p-3">URL</th><th className="p-3">Порядок</th><th className="p-3">Категория</th><th className="p-3">Наша страница</th></tr></thead><tbody>{links.map((row, index) => <tr key={row.id ?? `${row.url}-${index}`} className="border-t border-border"><td className="p-3">{row.createdAt ? formatDate(row.createdAt) : "—"}</td><td className="p-3">{platformLabels[row.platform ?? ""] ?? row.platform ?? "—"} · {modeLabels[row.mode ?? ""] ?? row.mode ?? "—"}</td><td className="p-3">{row.hostname}</td><td className="max-w-[420px] break-all p-3"><a href={row.url} rel="noreferrer" target="_blank" className="underline">{row.title || row.url}</a></td><td className="p-3">{row.sourceOrder}</td><td className="p-3">{row.category}</td><td className="p-3">{row.isOwned ? row.localPath ?? "Да" : "Нет"}</td></tr>)}</tbody></GeoTable> : <Empty>Цитат за выбранный период нет. Это означает отсутствие зафиксированных ссылок, а не отсутствие сайта в AI-ответах.</Empty>}</GeoPanel>
    <GeoPanel title="Дополнительные запросы" help="Fan-out — подзапросы или связанные вопросы, которые AI-интерфейс явно показал при подготовке ответа.">{queries.length ? <GeoTable minWidth="800px"><thead><tr><th className="p-3">Позиция</th><th className="p-3">Запрос</th><th className="p-3">Источник фиксации</th><th className="p-3">Платформа / режим</th></tr></thead><tbody>{queries.map((row) => <tr key={`${row.observationId}-${row.position}`} className="border-t border-border"><td className="p-3">{row.position}</td><td className="p-3">{row.queryText}</td><td className="p-3">{row.source}</td><td className="p-3">{platformLabels[row.platform ?? ""] ?? row.platform ?? "—"} · {modeLabels[row.mode ?? ""] ?? row.mode ?? "—"}</td></tr>)}</tbody></GeoTable> : <Empty>Интерфейс не показал дополнительных запросов либо они ещё не были зафиксированы.</Empty>}</GeoPanel>
    <GeoPanel title="Доступность для роботов" help="Ежедневная проверка robots.txt, sitemap и индексируемости целевых страниц; отсутствие строк означает, что проверка ещё не выполнялась.">{crawlerChecks?.items.length ? <GeoTable minWidth="900px"><thead><tr><th className="p-3">Дата</th><th className="p-3">Цель</th><th className="p-3">Робот / проверка</th><th className="p-3">Статус</th><th className="p-3">HTTP</th><th className="p-3">Причина</th></tr></thead><tbody>{crawlerChecks.items.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-3">{formatDate(row.checkDate)}</td><td className="p-3">{row.target}</td><td className="p-3">{row.bot}</td><td className="p-3">{row.status === "pass" ? "Доступно" : row.status === "fail" ? "Ошибка" : "Нет данных"}</td><td className="p-3">{row.httpStatus ?? "—"}</td><td className="p-3">{row.reasonCode ?? "—"}</td></tr>)}</tbody></GeoTable> : <Empty>Проверок доступности за выбранный период нет.</Empty>}</GeoPanel>
  </div>;
}

function EvidenceView({ evidence }: { evidence?: Evidence }) {
  if (!evidence) return <div className="space-y-6"><PageHeader title="Доказательства" description="Откройте конкретное наблюдение со страницы «Платформы», чтобы увидеть проверяемый снимок ответа." /><Empty>Наблюдение не выбрано.</Empty></div>;
  const row = evidence.observation;
  return <div className="space-y-6"><PageHeader title="Доказательства" description={`Снимок ответа от ${formatDate(row.observedAt)}. Он доступен только авторизованному администратору и не кэшируется.`} />
    <GeoPanel title="Условия наблюдения"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-sm text-muted-foreground">Платформа</dt><dd>{platformLabels[row.platform] ?? row.platform}</dd></div><div><dt className="text-sm text-muted-foreground">Режим</dt><dd>{modeLabels[row.mode] ?? row.mode}</dd></div><div><dt className="text-sm text-muted-foreground">Регион / язык</dt><dd>{row.region} · {row.language}</dd></div><div><dt className="text-sm text-muted-foreground">Модель</dt><dd>{row.modelName ?? "не указана"}</dd></div></dl></GeoPanel>
    <GeoPanel title="Снимок ответа" help="Сохранённый текст нужен для аудита метрик; размер одного снимка ограничен 16 КБ.">{row.snapshotTruncated ? <p className="mb-3 rounded-lg bg-amber-100 p-3 text-amber-950">Снимок был обрезан по безопасному лимиту. Метрики относятся к сохранённой части.</p> : null}<pre className="max-h-[560px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">{row.responseSnapshot || "Снимок пуст."}</pre></GeoPanel>
    <GeoPanel title="Упоминания сущностей">{evidence.mentions.length ? <GeoTable minWidth="800px"><thead><tr><th className="p-3">Порядок</th><th className="p-3">Сущность</th><th className="p-3">Тип / статус</th><th className="p-3">Рекомендован</th><th className="p-3">Тональность</th></tr></thead><tbody>{evidence.mentions.map((mention) => <tr key={mention.entityId} className="border-t border-border"><td className="p-3">{mention.firstMentionOrder}</td><td className="p-3">{mention.canonicalName}</td><td className="p-3">{mention.type} · {mention.status}</td><td className="p-3">{yesNo(mention.recommended)}</td><td className="p-3">{mention.sentiment}</td></tr>)}</tbody></GeoTable> : <Empty>Распознанных сущностей нет.</Empty>}</GeoPanel>
    <GeoPanel title="Цитаты и ссылки">{evidence.citations.length ? <ul className="space-y-2">{evidence.citations.map((citation, index) => <li key={citation.id ?? index}><span className="mr-2 text-muted-foreground">#{citation.sourceOrder}</span><a href={citation.url} target="_blank" rel="noreferrer" className="break-all underline">{citation.url}</a></li>)}</ul> : <Empty>Цитат в ответе нет.</Empty>}</GeoPanel>
    <GeoPanel title="Дополнительные запросы">{evidence.fanoutQueries.length ? <ol className="list-decimal space-y-2 pl-5">{evidence.fanoutQueries.map((query) => <li key={`${query.observationId}-${query.position}`}>{query.queryText} <span className="text-muted-foreground">({query.source})</span></li>)}</ol> : <Empty>Дополнительные запросы не зафиксированы.</Empty>}</GeoPanel>
  </div>;
}

function TrafficView({ referrals }: { referrals?: Page<Referral> }) {
  const rows = referrals?.items ?? [];
  return <div className="space-y-6"><PageHeader title="AI-трафик" description="Переходы с AI-платформ по данным Яндекс Метрики. Пользователи, визиты и просмотры — разные абсолютные величины." />
    <GeoPanel title="Переходы на сайт" help="Цели и заявки здесь пока не приписываются AI автоматически: без надёжной атрибуции это было бы вводящим в заблуждение.">{rows.length ? <GeoTable minWidth="950px"><thead><tr><th className="p-3">Дата</th><th className="p-3">Платформа</th><th className="p-3">Посадочная страница</th><HelpHeader label="Пользователи" help="Уникальные посетители по методике Метрики" /><th className="p-3">Новые пользователи</th><HelpHeader label="Визиты" help="Отдельные сессии пользователей" /><HelpHeader label="Просмотры" help="Просмотры страниц внутри визитов" /><th className="p-3">Данные обновлены</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.observationDate}-${row.platform}-${row.landingPath}`} className="border-t border-border"><td className="p-3">{formatDate(row.observationDate)}</td><td className="p-3">{platformLabels[row.platform] ?? row.platform}</td><td className="p-3">{row.landingPath}</td><td className="p-3">{integer.format(row.users)}</td><td className="p-3">{integer.format(row.newUsers)}</td><td className="p-3">{integer.format(row.visits)}</td><td className="p-3">{integer.format(row.pageviews)}</td><td className="p-3">{formatDate(row.importedAt)}</td></tr>)}</tbody></GeoTable> : <Empty>Переходов с распознанных AI-платформ за выбранный период пока нет. Ноль строк не равен нулевой позиции или ошибке.</Empty>}</GeoPanel>
  </div>;
}

function JsonSummary({ value }: { value: Record<string, unknown> }) {
  return Object.keys(value).length ? <pre className="max-w-[360px] overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(value, null, 2)}</pre> : <span className="text-muted-foreground">ещё нет</span>;
}

function PromotionView({ experiments, csrfToken }: { experiments?: Page<Experiment>; csrfToken: string }) {
  const rows = experiments?.items ?? [];
  return <div className="space-y-6"><PageHeader title="Продвижение в AI-выдаче" description="Цикл: доказательный сигнал → гипотеза → одобренное изменение → фиксированный baseline → оценки через 7, 14 и 28 дней. Контент автоматически не меняется." />
    <GeoPanel title="GEO-эксперименты" help="Агент может предложить эксперимент через MCP, но утверждение и привязка реально выполненного изменения остаются за администратором.">{rows.length ? <div className="space-y-4">{rows.map((row) => <article key={row.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">{statusLabels[row.status] ?? row.status} · {platformLabels[row.platform] ?? row.platform} · {modeLabels[row.mode] ?? row.mode}</p><h3 className="mt-1 text-lg font-semibold">{row.pagePath}</h3><p className="mt-2 max-w-4xl">{row.hypothesis}</p></div><p className="text-sm">Создан: {formatDate(row.createdAt)}</p></div><dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div><dt className="text-sm text-muted-foreground">Действие</dt><dd>{row.actionType}</dd></div><div><dt className="text-sm text-muted-foreground">Главная метрика</dt><dd>{row.primaryMetric} · {row.direction} минимум {row.minimumDelta}</dd></div><div><dt className="text-sm text-muted-foreground">Ожидаемый сигнал</dt><dd>{row.expectedSignal}</dd></div><div><dt className="text-sm text-muted-foreground">Окна оценки</dt><dd>{row.evaluationWindows.join(" / ")} дней</dd></div><div><dt className="text-sm text-muted-foreground">Baseline</dt><dd><JsonSummary value={row.baseline} /></dd></div><div><dt className="text-sm text-muted-foreground">Результаты 7/14/28 дней</dt><dd><JsonSummary value={row.evaluationResults} /></dd></div><div><dt className="text-sm text-muted-foreground">Возможные искажения</dt><dd>Проверяются полнота выборки, неизменность набора вопросов и параллельные изменения страницы.</dd></div><div><dt className="text-sm text-muted-foreground">Вердикт</dt><dd>{row.verdict}</dd></div></dl><div className="mt-4 flex flex-wrap gap-3">{row.status === "proposed" ? <Form method="post"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="approve-experiment" /><input type="hidden" name="id" value={row.id} /><button className="rounded bg-primary px-3 py-2 text-primary-foreground">Утвердить эксперимент</button></Form> : null}{row.status === "approved" && !row.seoChangeId ? <Form method="post" className="flex flex-wrap gap-2"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="link-experiment-change" /><input type="hidden" name="id" value={row.id} /><input required name="seoChangeId" placeholder="UUID изменения из журнала SEO" className="w-[300px] rounded border border-input bg-background px-3 py-2" /><button className="rounded bg-primary px-3 py-2 text-primary-foreground">Привязать изменение</button></Form> : null}</div></article>)}</div> : <Empty>Экспериментов пока нет. Агент создаёт только кандидатов с доказательствами; после этого администратор утверждает план здесь.</Empty>}</GeoPanel>
  </div>;
}

export function GeoAiVisibilityPage({ data, csrfToken }: { data: GeoAdminLoaderData; csrfToken: string }) {
  const actionData = useActionData() as { ok?: boolean; error?: string } | undefined;
  return <main className="min-w-0 space-y-6 overflow-x-hidden">
    <GeoTabs active={data.view} />
    {data.view !== "evidence" ? <GeoFilters filters={data.filters} view={data.view} /> : null}
    {actionData?.ok ? <p className="rounded-lg bg-emerald-100 p-3 text-emerald-950">Изменение сохранено.</p> : null}
    {actionData?.error ? <p className="rounded-lg bg-red-100 p-3 text-red-950">{actionData.error}</p> : null}
    {data.view === "overview" ? <OverviewView overview={data.overview} /> : null}
    {data.view === "platforms" ? <PlatformsView observations={data.observations} /> : null}
    {data.view === "prompts" ? <PromptsView prompts={data.prompts} csrfToken={csrfToken} /> : null}
    {data.view === "entities" ? <EntitiesView entities={data.entities} csrfToken={csrfToken} /> : null}
    {data.view === "sources" ? <SourcesView citations={data.citations} fanout={data.fanout} crawlerChecks={data.crawlerChecks} /> : null}
    {data.view === "evidence" ? <EvidenceView evidence={data.evidence} /> : null}
    {data.view === "traffic" ? <TrafficView referrals={data.referrals} /> : null}
    {data.view === "promotion" ? <PromotionView experiments={data.experiments} csrfToken={csrfToken} /> : null}
  </main>;
}

export default function GeoAiVisibilityRoute() {
  return <GeoAiVisibilityPage data={useLoaderData<GeoAdminLoaderData>()} csrfToken={useAdminCsrfToken()} />;
}

export const loader = (args: LoaderFunctionArgs) => createGeoSectionLoader(getAdminAuthService(), getGeoMonitoringService())(args);
export const action = (args: ActionFunctionArgs) => createGeoAdminAction(getAdminAuthService(), getGeoMonitoringService(), readAdminAuthConfig(process.env))(args);
export const headers = adminRouteHeaders;
