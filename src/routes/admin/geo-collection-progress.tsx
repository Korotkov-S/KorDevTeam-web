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
  complete: "Полная тройка",
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
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Вопрос",
                "AI-платформа",
                "Регион вопроса",
                "Ответы",
                "Статус",
                "Последняя отправка (Москва)",
                "Следующая попытка (Москва)",
                "Период сбора (Москва)",
                "Причина",
              ].map((l) => (
                <th key={l} className="p-2">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queue.items.map((j) => (
              <tr key={j.id} className="border-t border-border">
                <td className="p-2 min-w-48 max-w-80 break-words">
                  {j.promptText}
                </td>
                <td className="p-2">{platforms[j.platform] ?? j.platform}</td>
                <td className="p-2">{regions[j.region] ?? j.region}</td>
                <td className="p-2 whitespace-nowrap">
                  {j.completedRepetitions} / 3
                </td>
                <td className="p-2">{labels[j.state] ?? j.state}</td>
                <td className="p-2">{collectionTime(j.lastAttemptAt)}</td>
                <td className="p-2">
                  {j.nextAttemptAt
                    ? collectionTime(j.nextAttemptAt)
                    : j.state === "blocked"
                      ? "после устранения причины"
                      : "—"}
                </td>
                <td className="p-2">
                  {collectionTime(j.periodFrom)} — {collectionTime(j.periodTo)}
                </td>
                <td className="p-2">
                  {j.errorCode ? (errors[j.errorCode] ?? j.errorCode) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {queue.nextCursor && (
        <p>Показана часть очереди. Общие счётчики учитывают весь каталог.</p>
      )}
    </section>
  );
}
