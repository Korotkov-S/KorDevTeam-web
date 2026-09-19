import React from "react";
import { Link } from "react-router-dom";
import { PUBLIC_NAV_ITEMS } from "./PublicHeader";
import { Wordmark } from "./Wordmark";
import { track } from "../../lib/analytics";

export function PublicFooter(): React.JSX.Element {
  return (
    <footer className="border-t border-[color:color-mix(in_srgb,var(--public-ink)_12%,transparent)] bg-[var(--public-surface)] px-5 py-12 text-[var(--public-ink)] lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Link to="/" aria-label="KorDevTeam — главная">
            <Wordmark className="text-xl" />
          </Link>
          <p className="mt-4 max-w-md text-sm leading-6 text-[var(--public-subtle)]">
            Разрабатываем цифровые продукты, которые помогают бизнесу расти и работать проще.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[var(--public-blue)]">
            <a
              className="hover:text-[var(--public-violet)]"
              href="mailto:team@korotkov.dev"
              onClick={() => track("email_click", { path: window.location.pathname })}
            >
              team@korotkov.dev
            </a>
            <a
              className="hover:text-[var(--public-violet)]"
              href="https://telegram.me/ideamen51"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("telegram_click", { path: window.location.pathname })}
            >
              Telegram
            </a>
          </div>
        </div>

        <nav aria-label="Навигация в подвале" className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
          {PUBLIC_NAV_ITEMS.map(({ label, to }) => (
            <Link key={to} to={to} className="text-[var(--public-subtle)] hover:text-[var(--public-blue)]">
              {label}
            </Link>
          ))}
          <Link to="/privacy/" className="text-[var(--public-subtle)] hover:text-[var(--public-blue)]">Политика конфиденциальности</Link>
          <Link to="/requisites/" className="text-[var(--public-subtle)] hover:text-[var(--public-blue)]">Реквизиты</Link>
        </nav>
      </div>

      <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-[color:color-mix(in_srgb,var(--public-ink)_12%,transparent)] pt-6 text-sm text-[var(--public-subtle)] md:flex-row md:items-center md:justify-between">
        <p>© KorDevTeam</p>
        <button
          type="button"
          className="w-fit underline decoration-current underline-offset-4 hover:text-[var(--public-blue)]"
          onClick={() => window.dispatchEvent(new window.CustomEvent("kordev:open-consent-settings"))}
        >
          Настройки cookies
        </button>
      </div>
    </footer>
  );
}
