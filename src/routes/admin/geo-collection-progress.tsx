import React from "react";
import { collectionTime } from "./rankProgress";
export type GeoCollectionQueue = {
  items: Array<{
    id: string;
    promptText: string;
    platform: string;
    region: string;
    state: string;
    completedRepetitions: number;
    attempts: number;
    errorCode: string | null;
    nextAttemptAt: Date | string | null;
    lastAttemptAt: Date | string | null;
    periodFrom: Date | string | null;
    periodTo: Date | string | null;
    surface?: string;
    observations?: Array<{
      id: string;
      repetition: number;
      observedAt: Date | string;
      mentioned: boolean;
      linked: boolean;
      cited: boolean;
      sessionPersonalized: boolean;
    }>;
  }>;
  nextCursor: string | null;
  coverage: {
    startedAt?: Date | string | null;
    plannedCount: number;
    completeCount: number;
    remainingCount: number;
    blockedCount: number;
    cancelledCount: number;
    storedCount: number;
    plannedAnswers: number;
    minimumDays: number;
    goalDays: number;
  };
};
const regions: Record<string, string> = {
  RU: "Россия",
  "RU-MOW": "Москва",
  "RU-SPE": "Санкт-Петербург",
};
const platforms: Record<string, string> = {
  yandex_alice: "Алиса",
  google_ai: "Google AI",
  bing_copilot: "Bing Copilot",
  chatgpt_search: "ChatGPT Search",
};
const labels: Record<string, string> = {
  queued: "Не проверено",
  running: "В работе",
  retry_wait: "Ожидает продолжения",
  blocked: "Требуется действие",
  complete: "Сбор завершён",
  cancelled: "Отменено человеком",
};
const errors: Record<string, string> = {
  platform_auth_required: "Платформа требует входа",
  captcha_required: "Платформа требует CAPTCHA",
  live_ui_confirmation_required: "Нужно подтвердить отправку",
  platform_unavailable: "Платформа временно недоступна",
  browser_unavailable: "Браузер недоступен",
  geo_prompt_archived: "Вопрос отправлен в архив",
};
export function GeoCollectionProgress({
  queue,
  now = new Date(),
}: {
  queue: GeoCollectionQueue | null | undefined;
  now?: Date;
}) {
  if (!queue)
    return (
      <p>
        Очередь GEO ещё не доступна. Отсутствие проверки не означает отсутствие
        упоминания.
      </p>
    );
  const c = queue.coverage;
  const overdue = c.remainingCount > 0 && !!c.startedAt && +now > +new Date(c.startedAt) + c.goalDays * 86400000;
  return (
    <section
      className="rounded-xl border border-border p-5 space-y-3"
      aria-label="Очередь GEO и охват"
    >
      <h2 className="font-semibold">Очередь GEO и охват</h2>
      <p className="text-sm text-muted-foreground">Это текущий операционный цикл, не историческая аналитика за выбранный период. Общие счётчики учитывают весь каталог текущего цикла; строки ниже отфильтрованы по платформе и региону. Даты, поверхность, режим, язык, тема и персонализация не фильтруют очередь — они относятся к аналитике.</p>
      <p className="text-xs text-muted-foreground">Начало текущего цикла: {collectionTime(c.startedAt ?? null)} (Москва). Числа очереди и отчёта за период могут различаться.</p>
      {overdue && <p role="status">Целевой срок обхода превышен. Осталось {c.remainingCount} проверок; проверьте причины блокировки платформ.</p>}
      <p>
        Полные проверки вопроса на платформе: {c.completeCount} /{" "}
        {c.plannedCount}. Осталось: {c.remainingCount}. Блокировано:{" "}
        {c.blockedCount}. Отменено: {c.cancelledCount}.
      </p>
      <p>
        Фактических ответов: {c.storedCount} / {c.plannedAnswers}. Лимит: 18
        отправок и 6 разных вопросов в день.
      </p>
      <p>
        Минимальный полный обход: {c.minimumDays} дней. Цель: {c.goalDays} дней
        при доступности платформ. Неполные тройки не участвуют в сравнении
        видимости.
      </p>
      <p className="text-sm text-muted-foreground">
        «Проверено 3 / 3» означает, что сохранены три ответа, и не означает три рекомендации.
        Упоминания и ссылки считаются только среди сохранённых ответов этой строки, отдельно для каждой платформы.
        Упоминание названия не обязательно является рекомендацией; ссылка может быть прямой или в источниках ответа.
        Ваш новый ответ может отличаться: важны дата, поверхность и персонализация. Другие чаты и локальный контекст не входят в эту выборку.
      </p>
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Вопрос",
                "AI-платформа",
                "Регион вопроса",
                "Проверено",
                "Нас упомянули",
                "Ссылка на сайт",
                "Последний ответ (Москва)",
                "Сохранённые ответы",
                "Сбор и причины",
              ].map((l) => (
                <th key={l} className="p-2">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queue.items.map((j) => {
              const answers = j.observations ?? [];
              const count = answers.length;
              const latest = answers.reduce<Date | string | null>((date, answer) =>
                !date || +new Date(answer.observedAt) > +new Date(date) ? answer.observedAt : date, null);
              const sessions = new Set(answers.map(answer => answer.sessionPersonalized));
              return <tr key={j.id} className="border-t border-border align-top">
                <td className="p-2 min-w-48 max-w-80 break-words">
                  {j.promptText}
                </td>
                <td className="p-2">
                  {platforms[j.platform] ?? j.platform}
                  {j.surface && <p className="text-xs text-muted-foreground">{j.surface}</p>}
                  {count > 0 && <p className="text-xs text-muted-foreground">{sessions.size > 1
                    ? "Смешанная персонализация — не сравнивать"
                    : sessions.has(true) ? "Персонализированная сессия" : "Неперсонализированная сессия"}</p>}
                </td>
                <td className="p-2">{regions[j.region] ?? j.region}</td>
                <td className="p-2 whitespace-nowrap">
                  {j.observations ? count : j.completedRepetitions} / 3
                </td>
                <td className="p-2 whitespace-nowrap">
                  {count ? `${answers.filter(answer => answer.mentioned).length} / ${count}` : "Нет данных"}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {count ? `${answers.filter(answer => answer.linked || answer.cited).length} / ${count}` : "Нет данных"}
                </td>
                <td className="p-2">{collectionTime(latest)}</td>
                <td className="p-2">
                  {count ? <details>
                    <summary className="cursor-pointer underline">Посмотреть ответы ({count})</summary>
                    {count < 3 && <p className="mt-2 text-xs">Неполная выборка — не вывод о видимости.</p>}
                    <ul className="mt-2 space-y-3">{answers.map(answer => <li key={answer.id} className="min-w-52 text-sm">
                      <a className="underline" href={`/admin/seo/ai-visibility/?view=evidence&observation=${encodeURIComponent(answer.id)}`}>
                        Ответ {answer.repetition} · {collectionTime(answer.observedAt)}
                      </a>
                      <p>Упоминание: {answer.mentioned ? "да" : "нет"}. Ссылка на сайт: {answer.linked ? "да" : "нет"}. Сайт в источниках: {answer.cited ? "да" : "нет"}.</p>
                    </li>)}</ul>
                  </details> : <span>Нет сохранённых ответов</span>}
                </td>
                <td className="p-2 min-w-48">
                  <p>{labels[j.state] ?? j.state}</p>
                  {j.errorCode && <p>{errors[j.errorCode] ?? j.errorCode}</p>}
                  {j.observations && j.completedRepetitions !== count && <p>Счётчик сбора расходится с сохранёнными ответами — результат не подтверждён.</p>}
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer underline">Даты сбора (Москва)</summary>
                    <p>Последняя отправка: {collectionTime(j.lastAttemptAt)}</p>
                    <p>Следующая попытка: {j.nextAttemptAt ? collectionTime(j.nextAttemptAt) : j.state === "blocked" ? "после устранения причины" : "—"}</p>
                    <p>Период сбора: {collectionTime(j.periodFrom)} — {collectionTime(j.periodTo)}</p>
                  </details>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {queue.nextCursor && (
        <p>Показана часть очереди. Общие счётчики учитывают весь каталог.</p>
      )}
    </section>
  );
}
