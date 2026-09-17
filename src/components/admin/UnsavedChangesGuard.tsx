import { useCallback, useEffect } from "react";
import { useBlocker } from "react-router";

export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(when);
  const beforeUnload = useCallback((event: BeforeUnloadEvent) => {
    if (!when) return;
    event.preventDefault();
    event.returnValue = "";
  }, [when]);
  useEffect(() => {
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [beforeUnload]);
  if (blocker.state !== "blocked") return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h2 id="unsaved-title" className="text-xl font-semibold">Есть несохранённые изменения</h2>
        <p className="mt-2 text-muted-foreground">Если уйти со страницы, введённые данные будут потеряны.</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => blocker.reset()} className="rounded-lg border border-input px-4 py-2">Остаться</button>
          <button type="button" onClick={() => blocker.proceed()} className="rounded-lg bg-destructive px-4 py-2 text-destructive-foreground">Уйти</button>
        </div>
      </div>
    </div>
  );
}
