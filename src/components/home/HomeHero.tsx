import React from "react";
import { Section } from "../public/Section";
import { CtaLink } from "../public/CtaLink";

const disciplines = [
  { label: "CRM", className: "bg-[#e9ff64] text-[#10131f]" },
  { label: "API", className: "bg-[#ff7448] text-white" },
  { label: "WEB", className: "bg-[var(--public-blue)] text-white" },
  { label: "APP", className: "bg-[#9c6cff] text-white" },
  { label: "AI", className: "bg-[#111827] text-white dark:bg-white dark:text-[#111827]" },
] as const;

export function HomeHero() {
  return <Section id="home-hero" className="relative overflow-hidden !pb-20 !pt-14 sm:!pt-20 lg:!pb-28 lg:!pt-24">
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-12 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--public-hero-glow)_0%,transparent_68%)] sm:h-[44rem] sm:w-[44rem]" />
    <div className="flex flex-col items-center text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--public-violet)] sm:text-sm">KorDevTeam · разработка и автоматизация</p>
      <ul aria-label="Направления работы" className="mt-8 flex items-center justify-center pl-3 sm:mt-10 sm:pl-5">
        {disciplines.map((discipline, index) => <li key={discipline.label} className={`home-hero-orb relative -ml-3 grid h-16 w-16 place-items-center rounded-full border-4 border-[var(--public-surface)] text-xs font-bold tracking-[0.08em] shadow-sm sm:-ml-5 sm:h-20 sm:w-20 sm:text-sm ${discipline.className}`} style={{ zIndex: index === 2 ? 2 : 1 }}>
          {discipline.label}
        </li>)}
      </ul>
      <h1 className="mt-9 max-w-[76rem] text-balance text-[clamp(3.6rem,8.7vw,8.5rem)] font-medium leading-[0.84] tracking-[-0.075em] text-[var(--public-ink)]">
        Собираем бизнес в работающую систему
      </h1>
      <p className="mt-8 max-w-3xl text-balance text-lg leading-8 text-[var(--public-subtle)] sm:text-xl">Автоматизируем процессы, соединяем CRM и внешние сервисы, создаём веб-продукты и мобильные приложения.</p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <CtaLink to="/#contact">Обсудить проект</CtaLink>
        <CtaLink to="/cases/" variant="secondary">Смотреть кейсы</CtaLink>
      </div>
    </div>
  </Section>;
}
