import React, { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "../ThemeToggle";
import { CtaLink } from "./CtaLink";
import { Wordmark } from "./Wordmark";

export const PUBLIC_NAV_ITEMS = [
  { label: "Услуги", to: "/services/" },
  { label: "Кейсы", to: "/cases/" },
  { label: "Блог", to: "/blog/" },
  { label: "Журнал", to: "/journal/" },
  { label: "Контакты", to: "/#contact" },
] as const;

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function PublicHeader(): React.JSX.Element {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setIsMenuOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isMenuOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableElements = () => Array.from(
      mobileNavigationRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    focusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== "Tab") return;

      const elements = focusableElements();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="border-b border-[color:color-mix(in_srgb,var(--public-ink)_12%,transparent)] bg-[var(--public-surface)] text-[var(--public-ink)]">
      <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-6 px-5 py-4 lg:px-8">
        <Link to="/" aria-label="KorDevTeam — главная">
          <Wordmark className="text-xl" />
        </Link>

        <nav aria-label="Основная навигация" className="hidden items-center gap-6 lg:flex">
          {PUBLIC_NAV_ITEMS.map(({ label, to }) => (
            <Link key={to} to={to} className="text-sm font-medium text-[var(--public-subtle)] transition-colors hover:text-[var(--public-blue)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--public-blue)]">
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          <CtaLink to="/#contact">Обсудить проект</CtaLink>
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--public-ink)_18%,transparent)] lg:hidden"
          aria-label={isMenuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={isMenuOpen}
          aria-controls="public-mobile-navigation"
          onClick={() => (isMenuOpen ? closeMenu() : setIsMenuOpen(true))}
        >
          {isMenuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
        </button>
      </div>

      {isMenuOpen && (
        <div
          ref={mobileNavigationRef}
          id="public-mobile-navigation"
          role="dialog"
          aria-label="Мобильная навигация"
          aria-modal="true"
          className="border-t border-[color:color-mix(in_srgb,var(--public-ink)_12%,transparent)] bg-[var(--public-surface)] px-5 py-6 lg:hidden"
        >
          <nav aria-label="Мобильная навигация" className="mx-auto flex max-w-7xl flex-col gap-4">
            {PUBLIC_NAV_ITEMS.map(({ label, to }) => (
              <Link key={to} to={to} className="py-2 text-lg font-semibold" onClick={closeMenu}>
                {label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-3">
              <ThemeToggle />
              <CtaLink to="/#contact" onClick={closeMenu}>Обсудить проект</CtaLink>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
