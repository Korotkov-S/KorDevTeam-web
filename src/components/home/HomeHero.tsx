import React from "react";
import { ArrowUpRight, LifeBuoy, PanelsTopLeft, Smartphone, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { Section } from "../public/Section";
import { CtaLink } from "../public/CtaLink";

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
    description: "Сайт, приложение, 1С и Битрикс24 в одних руках. Сопровождаем действующие проекты, включая сайты на 1С-Битрикс.",
    to: "/#contact",
    icon: LifeBuoy,
  },
] as const;

const platformMarks = [
  { name: "WordPress", file: "wordpress", position: "lg:left-[14%] lg:top-[14%]" },
  { name: "Drupal", file: "drupal", position: "lg:left-[17%] lg:top-[79%]" },
  { name: "Telegram", file: "telegram", position: "lg:left-[93%] lg:top-[47%]" },
  { name: "AXELOT WMS", file: "axelot", position: "lg:left-[83%] lg:top-[79%]" },
];

const platformBadgeClass = "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/85 px-2.5 text-xs font-semibold text-[#151b37] lg:absolute lg:h-10 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:border lg:border-violet-100 lg:px-3 lg:shadow-[0_6px_20px_rgba(66,48,145,0.08)]";

export function HomeHero() {
  return <>
    <Section id="home-hero" className="relative isolate flex min-h-[calc(100dvh-var(--public-header-min-height))] flex-col justify-center !pb-11 !pt-12 sm:!pt-16 lg:!pb-28 lg:!pt-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.09),transparent_68%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.14),transparent_68%)]" />
        <div className="absolute inset-x-[5%] inset-y-[9%] -rotate-[7deg] rounded-[50%] border border-violet-400/25 dark:border-violet-300/20" />
        <div className="absolute inset-x-[9%] inset-y-[15%] rotate-[6deg] rounded-[50%] border border-dashed border-blue-400/25 dark:border-blue-300/20" />
      </div>
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="mx-auto max-w-[14em] text-balance text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[1.04] tracking-[-0.052em] text-[var(--public-ink)]">
          Берём на себя всю разработку для вашего бизнеса
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-7 text-[var(--public-subtle)] sm:mt-6 sm:text-xl sm:leading-8">
          Сайты, мобильные приложения, 1С и Битрикс24. Запускаем новые проекты, объединяем разные системы в одну и развиваем то, что уже работает.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3 sm:mt-8">
          <CtaLink to="/#contact">Обсудить задачу</CtaLink>
          <CtaLink to="/cases/" variant="secondary">Смотреть кейсы</CtaLink>
        </div>
      </div>
      <ul aria-label="Системы, с которыми работаем" className="mt-6 flex flex-wrap justify-center gap-1.5 lg:pointer-events-none lg:absolute lg:inset-0 lg:mt-0">
        <li className={`${platformBadgeClass} lg:left-[87%] lg:top-[14%]`}>
          <img src="/system-logos/1c.webp" alt="1С" width={144} height={80} className="h-auto w-9" />
        </li>
        <li className={`${platformBadgeClass} lg:left-[7.5%] lg:top-[48%]`}>
          <img src="/system-logos/b24.webp" alt="Битрикс24" width={312} height={56} className="h-auto w-[5.25rem]" />
        </li>
        {platformMarks.map(({ name, file, position }) => (
          <li key={name} className={`${platformBadgeClass} ${position}`}>
            <img src={`/system-logos/${file}.webp`} alt="" width={72} height={72} className="size-4" />
            {name}
          </li>
        ))}
        <li className={`${platformBadgeClass} lg:left-1/2 lg:top-[89%]`}>
          <Smartphone aria-hidden="true" size={15} />
          Android и iOS
        </li>
      </ul>
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
