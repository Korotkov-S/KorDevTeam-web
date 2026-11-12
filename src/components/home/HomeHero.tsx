import React from "react";
import { ArrowUpRight, LifeBuoy, PanelsTopLeft, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { Section } from "../public/Section";
import { CtaLink } from "../public/CtaLink";
import { HomePresentationVideo } from "./HomePresentationVideo";

const taskPaths = [
  {
    title: "Разработать сайт или приложение",
    description: "Веб-сервисы, личные кабинеты и мобильные приложения для клиентов и сотрудников.",
    to: "/services/",
    icon: PanelsTopLeft,
  },
  {
    title: "Связать системы и убрать ручной ввод",
    description: "Заявки, заказы и документы переходят между сайтом, 1С и CRM по согласованным правилам.",
    to: "/services/integrations/",
    icon: Workflow,
  },
  {
    title: "Передать проект на сопровождение",
    description: "Поддерживаем действующие сайты, мобильные приложения и интеграции. Работаем с сайтами на 1С-Битрикс.",
    to: "/#contact",
    icon: LifeBuoy,
  },
] as const;

const disciplines = [
  { label: "CRM", className: "bg-[#e9ff64] text-[#10131f]" },
  { label: "API", className: "bg-[#ff7448] text-white" },
  { label: "WEB", className: "z-[2] bg-[var(--public-blue)] text-[var(--public-action-foreground)]" },
  { label: "APP", className: "bg-[#9c6cff] text-white" },
  { label: "AI", className: "bg-[#111827] text-white dark:bg-white dark:text-[#111827]" },
  { label: "1С", className: "bg-[#c82731] text-white" },
  { label: "Битрикс24", className: "bg-[#bdefff] text-[#0b4669]" },
] as const;

export function HomeHero() {
  return <>
    <Section id="home-hero" className="relative flex min-h-[calc(100dvh-var(--public-header-min-height))] flex-col items-center justify-center !py-8 text-center max-[360px]:!py-4 sm:!py-12 sm:[@media(max-height:700px)]:!py-6">
      <div className="flex items-start gap-2 sm:gap-3">
        <ul aria-label="Направления работы" className="isolate flex items-center justify-center -space-x-2.5 sm:-space-x-5">
          {disciplines.map(({ label, className }) => (
            <li key={label} className={`relative grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-[var(--public-surface)] text-[10px] font-bold tracking-[0.08em] shadow-sm max-[360px]:size-10 sm:size-20 sm:border-4 sm:text-sm ${className}`}>
              {label === "Битрикс24" ? (
                <span className="text-[8px] leading-tight tracking-normal sm:text-xs">Битрикс<span className="block sm:inline">24</span></span>
              ) : <span>{label}</span>}
            </li>
          ))}
        </ul>
        <HomePresentationVideo />
      </div>
      <h1 className="mt-5 max-w-5xl text-balance text-[clamp(2.125rem,6vw,5.375rem)] font-semibold leading-[1.02] tracking-[-0.056em] text-[var(--public-ink)] max-[360px]:mt-4 sm:mt-9">
        Ваш отдел разработки <span className="whitespace-nowrap text-[var(--public-blue)]">на аутсорсе</span>
      </h1>
      <p className="mt-5 max-w-[42rem] text-pretty text-base leading-6 text-[var(--public-subtle)] max-[360px]:mt-3 max-[360px]:leading-5 sm:mt-6 sm:text-xl sm:leading-8">
        Берём на себя разработку и поддержку сайта, мобильного приложения, 1С и Битрикс24.
      </p>
      <p className="mt-4 max-w-[42rem] text-pretty text-base leading-6 text-[var(--public-subtle)] max-[360px]:mt-3 max-[360px]:leading-5 sm:text-xl sm:leading-8">
        Запускаем новые проекты, объединяем разные системы в одну и развиваем то, что уже работает.
      </p>

      <div className="mt-5 sm:mt-7 lg:absolute lg:right-10 lg:bottom-6 lg:mt-0 lg:text-right xl:bottom-10">
        <p className="text-sm leading-5 text-[var(--public-subtle)]">Сопровождение проектов</p>
        <p className="mt-1 text-xl font-semibold leading-tight text-[var(--public-ink)] sm:text-2xl">
          От 40 000 ₽ в месяц<sup>*</sup>
        </p>
        <small className="mt-1 block text-xs leading-5 text-[var(--public-subtle)]">* При заказе от 20 часов в месяц.</small>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3 max-[360px]:mt-4 max-[360px]:grid max-[360px]:w-full max-[360px]:grid-cols-2 max-[360px]:gap-2 max-[360px]:[&>a]:px-1 max-[360px]:[&>a]:text-xs sm:mt-8">
        <CtaLink to="/#contact">Обсудить задачу</CtaLink>
        <CtaLink to="/cases/" variant="secondary">Смотреть кейсы</CtaLink>
      </div>
    </Section>
    <Section id="task-paths" className="!pb-10 !pt-10 sm:!pt-12 lg:!pb-14">
      <h2 className="mb-4 text-xl font-semibold tracking-[-0.025em] text-[var(--public-ink)] sm:text-2xl">С чем к нам приходят</h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {taskPaths.map(({ title, description, to, icon: Icon }) => (
          <li key={title}>
            <Link to={to} className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-[var(--public-violet)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-blue)] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <Icon aria-hidden="true" size={21} className="text-[var(--public-violet)]" />
                <ArrowUpRight aria-hidden="true" size={16} className="text-[var(--public-subtle)] group-hover:text-[var(--public-violet)]" />
              </div>
              <h3 className="mt-3 text-base font-semibold leading-tight text-[var(--public-ink)] sm:text-lg">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--public-subtle)]">{description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  </>;
}
