import React from "react";
import { Section } from "../public/Section";
import { CtaLink } from "../public/CtaLink";

export function HomeHero() {
  return <Section id="home-hero">
    <p className="mb-6 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--public-violet)]">KorDevTeam / Разработка и автоматизация</p>
    <div className="grid items-end gap-10 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-[var(--public-ink)] sm:text-6xl lg:text-7xl">Помогаем бизнесу работать проще с помощью технологий</h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--public-subtle)]">Автоматизируем процессы, связываем системы и разрабатываем веб-сервисы и мобильные приложения под ваши задачи.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <CtaLink to="/#contact">Обсудить проект</CtaLink>
          <CtaLink to="/cases/" variant="secondary">Смотреть кейсы</CtaLink>
        </div>
      </div>
      <div className="rounded-[var(--public-radius-card)] border border-border bg-card p-6 lg:col-span-4 lg:p-8">
        <p className="text-sm font-medium text-[var(--public-subtle)]">От процесса к продукту</p>
        <div className="mt-6 space-y-3 text-lg font-semibold">
          <p className="rounded-xl bg-[var(--public-surface)] px-4 py-4">Задача бизнеса</p>
          <p aria-hidden="true" className="pl-4 text-[var(--public-violet)]">↓</p>
          <p className="rounded-xl bg-[var(--public-surface)] px-4 py-4">CRM · Интеграции · Приложения</p>
          <p aria-hidden="true" className="pl-4 text-[var(--public-violet)]">↓</p>
          <p className="rounded-xl bg-[var(--public-blue)] px-4 py-4 text-white dark:text-slate-950">Единая рабочая система</p>
        </div>
      </div>
    </div>
  </Section>;
}
