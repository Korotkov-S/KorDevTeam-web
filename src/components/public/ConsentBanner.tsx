import React, { useEffect, useRef } from "react";

import { useConsent } from "../../contexts/ConsentContext";

const actionClassName = "inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--public-blue)] bg-[var(--public-blue)] px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[var(--public-violet)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--public-blue)]";

export function ConsentBanner() {
  const { decision, accept, reject, closeSettings, settingsOpen, dialogOpen } = useConsent();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dialogOpen) return;
    const focusPrimaryAction = () => {
      dialogRef.current?.querySelector<HTMLElement>("[data-consent-action]")?.focus();
    };
    const keepFocusInDialog = (event: FocusEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) focusPrimaryAction();
    };
    focusPrimaryAction();
    document.addEventListener("focusin", keepFocusInDialog);
    return () => document.removeEventListener("focusin", keepFocusInDialog);
  }, [dialogOpen]);

  if (!dialogOpen) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && decision !== "unknown") {
      event.preventDefault();
      closeSettings();
      return;
    }

    if (event.key !== "Tab") return;
    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? [],
    );
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const currentChoice = decision === "accepted"
    ? "Сейчас аналитика разрешена. Вы можете изменить выбор."
    : decision === "rejected"
      ? "Сейчас выбраны только необходимые функции. Вы можете изменить выбор."
      : "Без вашего решения аналитические счётчики не загружаются.";

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] p-4 sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-dialog-title"
        aria-describedby="consent-dialog-description"
        onKeyDown={handleKeyDown}
        className="mx-auto max-w-4xl rounded-[var(--public-radius-card)] border border-border bg-card p-5 text-[var(--public-ink)] shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 id="consent-dialog-title" className="text-xl font-semibold tracking-tight sm:text-2xl">
              Настройки аналитики
            </h2>
            <p id="consent-dialog-description" className="mt-2 max-w-2xl text-sm leading-6 text-[var(--public-subtle)] sm:text-base">
              Мы используем Яндекс.Метрику и Top.Mail.Ru только с вашего разрешения. Отказ не ограничивает работу сайта.
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--public-ink)]">{currentChoice}</p>
          </div>
          {decision !== "unknown" && settingsOpen ? (
            <button
              type="button"
              aria-label="Закрыть настройки аналитики"
              onClick={closeSettings}
              className="shrink-0 rounded-full border border-border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--public-blue)]"
            >
              Закрыть
            </button>
          ) : null}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" data-consent-action="choice" className={actionClassName} onClick={accept}>
            Разрешить аналитику
          </button>
          <button type="button" data-consent-action="choice" className={actionClassName} onClick={reject}>
            Только необходимые
          </button>
        </div>
      </div>
    </div>
  );
}
