import React from "react";
import type { RankProgress } from "../../server/seo-monitoring/rankQueue";
export function collectionTime(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";
}
export function RankProgressPanel({
  progress,
}: {
  progress: RankProgress | null;
}) {
  if (!progress)
    return (
      <p>
        План контрольной проверки ещё не создан. Не проверено — не означает
        отсутствие сайта в выдаче.
      </p>
    );
  const action =
    progress.blockedCount > 0 ||
    (!progress.retryable && progress.status !== "success");
  return (
    <section
      className="rounded-xl border border-border p-5 space-y-2"
      aria-label="Ход контрольной проверки"
    >
      <h2 className="font-semibold">Ход контрольной проверки</h2>
      <p>
        Сохранено: {progress.storedCount} / {progress.plannedCount}. Не
        проверено: {progress.remainingCount}. Блокировано:{" "}
        {progress.blockedCount}.
      </p>
      <p>
        {progress.status === "success"
          ? "Полный снимок"
          : action
            ? "Требуется действие"
            : "Неполный снимок — продолжение запланировано"}
      </p>
      <p>
        Период сбора: {collectionTime(progress.periodFrom)} —{" "}
        {collectionTime(progress.periodTo)} (Москва).
      </p>
      <p>
        Следующая попытка:{" "}
        {progress.nextAttemptAt
          ? collectionTime(progress.nextAttemptAt)
          : action
            ? "после устранения причины"
            : "—"}
        .
      </p>
      {progress.errorCode && (
        <p>
          {progress.errorCode === "legacy_resume_unavailable"
            ? "Старый запуск не сохранил ID поисковых операций. Автоматический повтор отключён, чтобы не списать деньги повторно."
            : progress.errorCode === "seo_rank_submission_uncertain"
              ? "Исход платной отправки неизвестен. Повтор отключён до проверки расходов."
              : progress.errorCode}
        </p>
      )}
      {progress.status !== "success" && (
        <p className="text-muted-foreground">
          Изменение позиций по неполному снимку не рассчитывается. Готовые
          результаты доступны с фактической датой.
        </p>
      )}
    </section>
  );
}
