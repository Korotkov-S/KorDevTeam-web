import React from "react";
import { Link } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { CaseCard } from "../components/public/CaseCard";
import { ContentCard } from "../components/public/ContentCard";
import { FaqList } from "../components/public/FaqList";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section, SectionHeading } from "../components/public/Section";
import { track } from "../lib/analytics";
import type { BlockView, ServicePageView } from "../server/content/types";

export const SERVICE_SECTION_ORDER = [
  "hero", "readiness", "benefits", "automation-examples", "problems", "solutions", "methodology", "deliverables",
  "integrations", "process", "metrics", "cases", "results", "guarantees",
  "reading", "faq", "articles", "meeting", "lead",
] as const;

const PORTRAIT = "/team/gennady-korotkov.jpg?v=20260919";

const MEETING_STEPS = [
  "Познакомимся и обсудим ваш бизнес",
  "Зафиксируем главную задачу",
  "Разберём текущий процесс",
  "Обсудим ограничения и риски",
  "Предложим подходящий формат",
  "Договоримся о следующем шаге",
] as const;

function number(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function NumberedStatements({ items, inverted = false }: { items: string[]; inverted?: boolean }) {
  return <ol className={`border-t ${inverted ? "border-white/25" : "border-border"}`}>
    {items.map((item, index) => <li
      key={item}
      className={`grid gap-4 border-b py-6 sm:grid-cols-[5rem_minmax(0,1fr)] sm:items-start sm:py-8 ${inverted ? "border-white/25" : "border-border"}`}
    >
      <span
        data-statement-number
        className={`text-sm font-semibold tracking-[0.16em] ${inverted ? "text-[#a99cff]" : "text-[var(--public-violet)]"}`}
      >{number(index)}</span>
      <p className="max-w-4xl text-balance text-2xl font-medium leading-[1.15] tracking-[-0.035em] sm:text-3xl lg:text-4xl">{item}</p>
    </li>)}
  </ol>;
}

function BlockList({ items, accent = false, inverted = false }: { items: BlockView[]; accent?: boolean; inverted?: boolean }) {
  return <ol className="grid gap-px overflow-hidden rounded-[2rem] bg-border lg:grid-cols-2">
    {items.map((item, index) => <li
      key={`${item.title}:${item.description}`}
      className={`min-h-64 p-7 sm:p-9 ${inverted ? "bg-[#151b2f] text-white" : accent ? "bg-[#eef0ff] text-[#10152a] dark:bg-[#262044] dark:text-white" : "bg-card"}`}
    >
      <p className="text-sm font-semibold tracking-[0.16em] text-[var(--public-violet)]">{number(index)}</p>
      <h3 className="mt-12 max-w-lg text-2xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-3xl">{item.title}</h3>
      <p className={`mt-4 max-w-xl text-base leading-7 ${inverted ? "text-white/70" : accent ? "text-[#535d74] dark:text-[#c8cce0]" : "text-[var(--public-subtle)]"}`}>{item.description}</p>
    </li>)}
  </ol>;
}

function ReadinessCriteria({ items }: { items: BlockView[] }) {
  return <ol className="grid overflow-hidden rounded-[2rem] border border-border bg-card md:grid-cols-3">
    {items.map((item, index) => <li
      key={`${item.title}:${item.description}`}
      data-readiness-criterion
      className="border-b border-border p-7 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-8"
    >
      <p className="text-sm font-semibold tracking-[0.16em] text-[var(--public-violet)]">{number(index)}</p>
      <h3 className="mt-7 text-2xl font-semibold leading-[1.05] tracking-[-0.04em]">{item.title}</h3>
      <p className="mt-4 leading-7 text-[var(--public-subtle)]">{item.description}</p>
    </li>)}
  </ol>;
}

function BusinessBenefits({ items }: { items: BlockView[] }) {
  return <ol className="grid gap-px overflow-hidden rounded-[2rem] bg-white/15 md:grid-cols-2 lg:grid-cols-3">
    {items.map((item, index) => <li key={`${item.title}:${item.description}`} className="bg-[#10162a] p-7 sm:p-8">
      <p className="text-sm font-semibold tracking-[0.16em] text-[#a99cff]">{number(index)}</p>
      <h3 className="mt-7 text-2xl font-semibold leading-[1.08] tracking-[-0.04em]">{item.title}</h3>
      <p className="mt-4 leading-7 text-white/70">{item.description}</p>
    </li>)}
  </ol>;
}

function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return <details className="group mt-10 rounded-[1.5rem] border border-border bg-card px-6 py-1 sm:px-8">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-semibold marker:content-none">
      <span>{summary}</span>
      <span aria-hidden="true" className="text-2xl font-light text-[var(--public-violet)] transition group-open:rotate-45">+</span>
    </summary>
    <div className="border-t border-border pb-8">{children}</div>
  </details>;
}

function ServiceSection({ name, className = "", children }: { name: typeof SERVICE_SECTION_ORDER[number]; className?: string; children: React.ReactNode }) {
  return <div data-service-section={name} className={className}>{children}</div>;
}

function HeroTerms({ price }: { price: ServicePageView["price"] }) {
  const hasHourPackage = price?.packageHours !== undefined && price.hourlyRate !== undefined;
  return <dl data-hero-terms className="grid grid-cols-1 gap-px overflow-hidden rounded-[1.5rem] bg-black/10 dark:bg-white/10">
    <div className="bg-white/70 p-5 backdrop-blur dark:bg-white/5">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--public-subtle)]">Стоимость</dt>
      <dd className="mt-3 text-xl font-semibold tracking-[-0.035em]">
        {price?.from !== null && price?.from !== undefined
          ? <>от {formatPrice(price.from)} ₽{hasHourPackage ? "/мес" : ""}</>
          : "После оценки"}
      </dd>
    </div>
    <div className="bg-white/70 p-5 backdrop-blur dark:bg-white/5">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--public-subtle)]">{hasHourPackage ? "Пакет" : "Срок"}</dt>
      <dd className="mt-3 text-xl font-semibold tracking-[-0.035em]">
        {hasHourPackage ? <>{price.packageHours} часов · {formatPrice(price.hourlyRate)} ₽/час</> : price?.timeRange ?? "Зависит от задачи"}
      </dd>
    </div>
  </dl>;
}

export function ServicePage({ pathname, service }: { pathname: string; service: ServicePageView }) {
  const hasSolutions = service.solutions.length > 0 || Boolean(service.bodyMd.trim());
  const hasIntegrations = service.integrations.length > 0 || service.technologies.length > 0;
  const hasProcess = service.processSteps.length > 0 || service.price !== null;
  const hasAutomationExpertise = service.benefits.length > 0 || service.methodologyPrinciples.length > 0;
  const serviceSlug = pathname.match(/^\/services\/([^/]+)\/?$/)?.[1];
  const isBusinessAutomation = serviceSlug === "business-process-automation";
  const isCrmDevelopment = serviceSlug === "crm-development";
  const isWebServices = serviceSlug === "web-services";
  const isMobileAppDevelopment = serviceSlug === "mobile-app-development";
  const isSystemsIntegration = serviceSlug === "integrations";
  const isAiAutomation = serviceSlug === "ai-automation";
  const isSupportDevelopment = serviceSlug === "additional-service";

  const handlePrimaryCta = () => {
    track("service_cta_click", { path: pathname, ...(serviceSlug ? { serviceSlug } : {}) });
  };

  return <article>
    <ServiceSection name="hero" className="relative overflow-hidden border-b border-border bg-[#f3f5fb] text-[#0b1020] dark:bg-[#101522] dark:text-white">
      <Section className="relative pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
        <div aria-hidden="true" className="absolute -right-32 top-20 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(87,83,255,.22),rgba(87,83,255,0)_68%)]" />
        <nav aria-label="Хлебные крошки" className="relative mb-12 text-sm text-[#667085] dark:text-[#aeb7c8]">
          <Link className="underline underline-offset-4" to="/services/">Услуги</Link>
          <span aria-hidden="true"> · </span>
          <span aria-current="page">{service.h1}</span>
        </nav>

        <div className="relative grid gap-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--public-violet)]">KorDevTeam · Услуга</p>
            <h1 className="mt-5 max-w-5xl text-balance text-5xl font-semibold leading-[.93] tracking-[-0.065em] sm:text-7xl lg:text-[5.6rem]">{service.h1}</h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-[#566176] dark:text-[#b9c1d1] sm:text-xl">{service.lead}</p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href="#contact"
                data-event-name="service_cta_click"
                onClick={handlePrimaryCta}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--public-blue)] px-7 py-3 text-sm font-semibold text-[var(--public-action-foreground)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--public-violet)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-blue)]"
              >Обсудить задачу <span aria-hidden="true" className="ml-3">↗</span></a>
              <a href="#process" className="inline-flex min-h-12 items-center border-b border-current px-1 text-sm font-semibold">Посмотреть процесс ↓</a>
            </div>
          </div>

          <aside data-hero-expert-card className="w-full rounded-[2rem] bg-white/80 p-5 shadow-[0_24px_80px_rgba(38,46,77,.10)] backdrop-blur dark:bg-white/[.07] sm:p-6 lg:w-[26rem] lg:justify-self-end" aria-label="Эксперт по проекту">
            <HeroTerms price={service.price} />
            <div className="mt-6 grid grid-cols-[5rem_1fr] items-center gap-4">
              <img src={PORTRAIT} alt="Геннадий Коротков" width="320" height="320" className="aspect-square w-20 rounded-full object-cover" />
              <div>
                <p className="font-semibold">Геннадий Коротков</p>
                <p className="mt-1 text-sm text-[var(--public-subtle)]">Руководитель KorDevTeam</p>
              </div>
            </div>
            <p className="mt-5 border-t border-black/10 pt-5 leading-7 text-[#4f5a70] dark:border-white/10 dark:text-[#c8d0df]">Лично разберу задачу и предложу следующий шаг.</p>
          </aside>
        </div>

        <ul className="relative mt-14 grid gap-px overflow-hidden rounded-[1.5rem] bg-black/10 dark:bg-white/10 sm:grid-cols-3">
          {["Проектируем под реальный процесс", "Показываем результат по этапам", "Сопровождаем запуск и внедрение"].map((item, index) => <li key={item} className="bg-white/65 p-5 text-sm font-medium backdrop-blur dark:bg-white/5 sm:p-6">
            <span className="mr-3 text-[var(--public-violet)]">{number(index)}</span>{item}
          </li>)}
        </ul>
      </Section>
    </ServiceSection>

    {service.readiness.length > 0 && <ServiceSection name="readiness">
      <Section>
        <SectionHeading
          eyebrow={isCrmDevelopment || isMobileAppDevelopment ? "Когда это оправдано" : isWebServices || isSystemsIntegration || isAiAutomation || isSupportDevelopment ? "Когда это нужно" : "Подходит ли процесс"}
          title={isCrmDevelopment
            ? "Когда компании нужна собственная CRM"
            : isWebServices
              ? "Какие задачи решает веб-сервис"
              : isMobileAppDevelopment
                ? "Когда мобильное приложение действительно нужно бизнесу"
                : isSystemsIntegration
                  ? "Когда компании нужна интеграция систем"
                  : isAiAutomation
                    ? "Когда компании нужна AI-автоматизация"
                    : isSupportDevelopment ? "Когда сайту или веб-сервису нужна поддержка" : "Когда автоматизация принесёт результат"}
          description={service.readinessIntro ?? undefined}
        />
        <div className="mt-12"><ReadinessCriteria items={service.readiness} /></div>
      </Section>
    </ServiceSection>}

    {service.benefits.length > 0 && <ServiceSection name="benefits" className="bg-[#0b1020] text-white">
      <Section>
        <SectionHeading
          eyebrow={isCrmDevelopment ? "Современная разработка" : "Практический эффект"}
          title={isCrmDevelopment
            ? "Почему разработка собственной CRM стала доступнее"
            : isWebServices
              ? "Что веб-сервис даёт бизнесу"
              : isMobileAppDevelopment
                ? "Какой результат должно дать мобильное приложение"
              : isSystemsIntegration
                ? "Что единый цифровой контур даёт бизнесу"
                : isAiAutomation
                  ? "Что внедрение ИИ даёт бизнесу"
                  : isSupportDevelopment ? "Что поддержка и развитие дают бизнесу" : "Что автоматизация даёт бизнесу"}
          description={isCrmDevelopment
            ? "Используем ИИ-инструменты и проверенные open-source компоненты, чтобы не расходовать бюджет на повторное создание типовых функций."
            : isWebServices
              ? "Автоматизируем повторяемые действия, ускоряем работу с заявками и освобождаем менеджеров от ручных расчётов, документов и переноса данных."
              : isMobileAppDevelopment
                ? "Оцениваем приложение по изменениям в работе бизнеса: скорости операций, объёму ручного труда, качеству данных, повторным действиям и стоимости обслуживания."
              : isSystemsIntegration
                ? "Связываем разрозненные программы в одну цепочку, чтобы бизнес видел движение заказа, данных и документов от первого обращения до результата."
              : isAiAutomation
                ? "Сокращаем ручную обработку информации, ускоряем доступ к знаниям и оставляем критичные решения под контролем сотрудников."
              : isSupportDevelopment
                ? "Соединяем оперативное устранение инцидентов с плановым развитием, чтобы продукт оставался надёжным и продолжал приносить бизнесу результат."
            : "Автоматизация снимает рутину с команды, повышает надёжность работы и помогает компании расти без лишней операционной нагрузки."}
          tone="inverse"
        />
        <div className="mt-12"><BusinessBenefits items={service.benefits} /></div>
      </Section>
    </ServiceSection>}

    {service.automationExamples.length > 0 && <ServiceSection name="automation-examples" className="border-b border-border bg-[#f5f6f9] dark:bg-[#111722]">
      <Section className="py-12 lg:py-16">
        <SectionHeading
          eyebrow={isSystemsIntegration ? "Сценарии интеграции" : isSupportDevelopment ? "Направления работы" : isCrmDevelopment || isWebServices || isMobileAppDevelopment || isAiAutomation ? "Типы решений" : "Примеры процессов"}
          title={isCrmDevelopment
            ? "Какие CRM-системы мы разрабатываем"
            : isWebServices
              ? "Какие веб-сервисы мы разрабатываем"
              : isMobileAppDevelopment
                ? "Какие мобильные приложения мы разрабатываем"
                : isSystemsIntegration
                  ? "Какие системы мы объединяем"
                  : isAiAutomation
                    ? "Какие задачи можно передать ИИ"
                    : isSupportDevelopment ? "Какие задачи берём на себя" : "Какие бизнес-процессы можно автоматизировать"}
          description={isCrmDevelopment
            ? "Проектируем кастомную CRM под модель продаж, структуру компании и отраслевую логику — от внутренней системы до самостоятельного цифрового продукта."
            : isWebServices
              ? "Разрабатываем системы, которые выполняют конкретную задачу бизнеса: помогают клиенту, партнёру или сотруднику пройти нужный процесс в одном интерфейсе."
              : isMobileAppDevelopment
                ? "Создаём клиентские и корпоративные приложения под конкретный сценарий — от повторной покупки до работы выездного сотрудника без стабильного интернета."
              : isSystemsIntegration
                ? "Соединяем учёт, продажи, производство, склад, сайт, коммуникации и внешние сервисы без замены уже работающих программ."
              : isAiAutomation
                ? "Выбираем работу с понятным результатом: ИИ готовит ответ или выполняет ограниченное действие, а человек контролирует исключения."
              : isSupportDevelopment
                ? "Подключаемся и к аварийным ситуациям, и к регулярному развитию продукта — от инфраструктуры и безопасности до клиентских функций и SEO."
            : "Начинаем с повторяемого участка, где известны входные данные, правила и ожидаемый результат."}
        />
        <ul className={`mt-10 grid gap-px overflow-hidden rounded-[1.5rem] bg-border sm:grid-cols-2 ${isSupportDevelopment ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {service.automationExamples.map((item, index) => <li key={item} className={`min-h-28 bg-card p-5 sm:p-6 ${!isSupportDevelopment && index === service.automationExamples.length - 1 ? "sm:col-span-2" : ""}`}>
            <span className="text-xs font-semibold tracking-[0.14em] text-[var(--public-violet)]">{number(index)}</span>
            <p className="mt-4 text-lg font-semibold leading-snug tracking-[-0.02em]">{item}</p>
          </li>)}
        </ul>
      </Section>
    </ServiceSection>}

    {service.problems.length > 0 && <ServiceSection name="problems" className="bg-[#0b1020] text-white">
      <Section>
        <SectionHeading
          eyebrow={service.readiness.length ? "Потери" : "Когда это нужно"}
          title={service.readiness.length ? "Какие потери устраняет автоматизация" : "Задачи, с которыми к нам приходят"}
          tone="inverse"
        />
        <div className="mt-12"><NumberedStatements items={service.problems} inverted /></div>
      </Section>
    </ServiceSection>}

    {hasSolutions && <ServiceSection name="solutions">
      <Section>
        <SectionHeading
          eyebrow={isSupportDevelopment ? "Прозрачность работы" : "Состав услуги"}
          title={isBusinessAutomation
            ? "Разработка и внедрение автоматизации под ключ"
            : isCrmDevelopment
              ? "Разработка собственной CRM под ключ"
              : isWebServices
                ? "Разработка веб-сервиса под ключ"
                : isMobileAppDevelopment
                  ? "Разработка мобильного приложения под ключ"
                  : isSystemsIntegration
                    ? "Интеграция корпоративных систем под ключ"
                    : isAiAutomation
                      ? "Внедрение ИИ в бизнес-процессы под ключ"
                      : isSupportDevelopment ? "Как организована работа с клиентом" : "Что берём на себя"}
          description={isCrmDevelopment
            ? "От аудита процессов и расчёта совокупной стоимости владения — до разработки, переноса данных и запуска во всех подразделениях."
            : isWebServices
              ? "От исследования пользователей и прототипа — до архитектуры, разработки, интеграций, запуска и дальнейшего развития продукта."
            : isMobileAppDevelopment
                ? "От проверки мобильного сценария и прототипа — до приложения, backend, интеграций, тестирования на устройствах, публикации и поддержки."
            : isSystemsIntegration
              ? "От обследования цифрового контура и карты данных — до разработки обмена, тестирования, мониторинга и сопровождения запуска."
            : isAiAutomation
              ? "От выбора сценария и подготовки контрольной выборки — до пилота, интеграции, мониторинга качества и развития решения."
            : isSupportDevelopment
              ? "Клиент видит все задачи и движение работы на своей публичной доске, участвует в согласовании приоритетов и получает прямой доступ к актуальному состоянию проекта."
            : hasAutomationExpertise
              ? "Берём на себя весь путь — от изучения текущей работы до запуска системы, обучения сотрудников и оценки результата."
              : "Не продаём отдельные экраны и функции — собираем рабочий сценарий, который решает задачу бизнеса."}
        />
        {service.solutions.length > 0 && <div className="mt-12"><NumberedStatements items={service.solutions} /></div>}
        {service.bodyMd.trim() && (hasAutomationExpertise
          ? <Disclosure summary="Показать наш подход"><MarkdownContent markdown={service.bodyMd} media={service.media} proseClassName="mt-8 max-w-4xl" /></Disclosure>
          : <MarkdownContent markdown={service.bodyMd} media={service.media} proseClassName="mt-14 max-w-4xl" />)}
      </Section>
    </ServiceSection>}

    {(service.methodologies.length > 0 || service.methodologyPrinciples.length > 0) && <ServiceSection name="methodology" className="border-y border-border bg-[#f5f6f9] dark:bg-[#111722]">
      <Section>
        <SectionHeading
          eyebrow="Профессиональная основа"
          title={service.methodologyPrinciples.length ? "На чём основан наш подход" : "По какой методологии работаем"}
          description="Сначала разбираем процесс и убираем лишние действия, затем проектируем изменение и только после этого автоматизируем."
        />
        {service.methodologyPrinciples.length > 0 && <div className="mt-12"><NumberedStatements items={service.methodologyPrinciples} /></div>}
        {service.methodologies.length > 0 && (service.methodologyPrinciples.length > 0
          ? <Disclosure summary="Методологии и стандарты">
            <ul className="grid gap-4 pt-8 md:grid-cols-2">
              {service.methodologies.map(item => <li key={item.href}>
                <a href={item.href} target="_blank" rel="noopener noreferrer" className="group block h-full rounded-[1.25rem] border border-border p-6 transition hover:border-[var(--public-violet)]">
                  <h3 className="text-xl font-semibold tracking-[-0.025em]">{item.title}</h3>
                  <p className="mt-3 leading-7 text-[var(--public-subtle)]">{item.description}</p>
                  <span className="mt-5 inline-block text-sm font-semibold text-[var(--public-blue)]">Первоисточник ↗</span>
                </a>
              </li>)}
            </ul>
          </Disclosure>
          : <ul className="mt-12 grid gap-4 md:grid-cols-2">
            {service.methodologies.map((item, index) => <li key={item.href}>
              <a href={item.href} target="_blank" rel="noopener noreferrer" className="group flex min-h-64 flex-col rounded-[2rem] border border-border bg-card p-7 transition hover:-translate-y-1 hover:border-[var(--public-violet)] sm:p-9">
                <span className="text-sm font-semibold tracking-[0.16em] text-[var(--public-violet)]">{number(index)}</span>
                <h3 className="mt-10 text-2xl font-semibold tracking-[-0.035em]">{item.title}</h3>
                <p className="mt-4 leading-7 text-[var(--public-subtle)]">{item.description}</p>
                <span className="mt-auto pt-8 text-sm font-semibold text-[var(--public-blue)]">Первоисточник ↗</span>
              </a>
            </li>)}
          </ul>)}
      </Section>
    </ServiceSection>}

    {service.deliverables.length > 0 && <ServiceSection name="deliverables">
      <Section>
        <SectionHeading eyebrow="Результат обследования" title="Что получает клиент после обследования" description="Перед разработкой формируем комплект материалов, по которому можно принимать решения, оценивать проект и контролировать результат." />
        <div className="mt-12"><NumberedStatements items={service.deliverables} /></div>
      </Section>
    </ServiceSection>}

    {hasIntegrations && <ServiceSection name="integrations" className="border-y border-border bg-[#eef1ff] dark:bg-[#18152b]">
      <Section>
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
          <SectionHeading
            eyebrow="Технологическая среда"
            title={isBusinessAutomation
              ? "Интеграция с 1С, CRM, ERP и MES"
              : isCrmDevelopment
                ? "Интеграция CRM с 1С, ERP и сервисами"
                : isWebServices
                  ? "Интеграция веб-сервиса с 1С, CRM, ERP и внешними API"
                  : isMobileAppDevelopment
                    ? "Интеграция мобильного приложения с 1С, CRM, ERP и API"
                    : isSystemsIntegration
                      ? "Интеграция 1С, CRM, ERP, MES, сайтов и внешних сервисов"
                      : isAiAutomation
                        ? "Интеграция ИИ с 1С, CRM, ERP и корпоративными данными"
                        : isSupportDevelopment ? "С какими платформами и инфраструктурой работаем" : "Встраиваем решение в ваш бизнес"}
            description={isSupportDevelopment
              ? "Поддерживаем готовые CMS и заказные веб-сервисы, разбираемся в приложении, базе данных, сервере и связанных бизнес-системах."
              : "Учитываем уже используемые сервисы и выбираем стек под задачу, поддержку и развитие продукта."}
          />
          <div className="grid gap-8 sm:grid-cols-2">
            {service.integrations.length > 0 && <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--public-violet)]">{isSupportDevelopment ? "Платформы и системы" : "Интеграции"}</h3>
              <ul className="mt-5 border-t border-[#b8c0dc] dark:border-white/20">{service.integrations.map(item => <li key={item} className="border-b border-[#b8c0dc] py-4 text-lg font-medium dark:border-white/20">{item}</li>)}</ul>
            </div>}
            {service.technologies.length > 0 && <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--public-violet)]">{isSupportDevelopment ? "Инфраструктура и инструменты" : "Технологии"}</h3>
              <ul className="mt-5 border-t border-[#b8c0dc] dark:border-white/20">{service.technologies.map(item => <li key={item} className="border-b border-[#b8c0dc] py-4 text-lg font-medium dark:border-white/20">{item}</li>)}</ul>
            </div>}
          </div>
        </div>
      </Section>
    </ServiceSection>}

    {hasProcess && <ServiceSection name="process">
      <Section id="process">
        <SectionHeading
          eyebrow="Процесс"
          title={isCrmDevelopment
            ? "Этапы разработки и внедрения CRM-системы"
            : isWebServices
              ? "Этапы разработки веб-сервиса и личного кабинета"
              : isMobileAppDevelopment
                ? "Этапы разработки мобильного приложения"
                : isSystemsIntegration
                  ? "Этапы интеграции корпоративных систем"
                  : isAiAutomation
                    ? "Этапы внедрения ИИ в бизнес-процессы"
                    : isSupportDevelopment ? "Как принимаем и ведём проект на поддержке" : "Как строится работа"}
          description={isSupportDevelopment
            ? "Сначала безопасно принимаем продукт, затем ведём инциденты и развитие в одном прозрачном процессе с понятными статусами, отчётностью и согласованием релизов."
            : "Двигаемся короткими понятными этапами: у каждого есть результат, который можно проверить."}
        />
        {service.processSteps.length > 0 && <div className="mt-12"><BlockList items={service.processSteps} /></div>}
        {service.price && <div className="mt-8 grid gap-8 rounded-[2rem] bg-[#0b1020] p-7 text-white sm:p-10 lg:grid-cols-[.8fr_1.2fr] lg:p-12">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#a99cff]">{isBusinessAutomation
              ? "Стоимость и сроки автоматизации бизнес-процессов"
              : isCrmDevelopment
                ? "Стоимость и сроки разработки CRM-системы на заказ"
                  : isWebServices
                    ? "Стоимость и сроки разработки веб-сервиса на заказ"
                  : isMobileAppDevelopment
                    ? "Стоимость и сроки разработки мобильного приложения"
                    : isSystemsIntegration
                      ? "Стоимость и сроки интеграции корпоративных систем"
                      : isAiAutomation
                        ? "Стоимость и сроки AI-автоматизации бизнеса"
                        : isSupportDevelopment ? "Стоимость и формат технической поддержки" : "Предварительная оценка"}</p>
            <h3 className="mt-5 text-4xl font-semibold leading-none tracking-[-0.05em] sm:text-5xl">
              {service.price.from !== null
                ? <>от {formatPrice(service.price.from)} ₽{service.price.packageHours !== undefined ? " в месяц" : ""}</>
                : "После обследования"}
            </h3>
            {service.price.packageHours !== undefined && <p className="mt-5 text-lg text-white/80">Минимальный пакет — {service.price.packageHours} часов в месяц</p>}
            {service.price.hourlyRate !== undefined && <p className="mt-2 text-lg text-white/80">Ставка — {formatPrice(service.price.hourlyRate)} ₽/час</p>}
            {service.price.timeRange && <p className={`${service.price.packageHours !== undefined ? "mt-4" : "mt-5"} text-lg text-white/70`}>
              {isSupportDevelopment ? "Время реакции" : "Срок"}: {service.price.timeRange}
            </p>}
          </div>
          {service.price.factors.length > 0 && <div>
            <p className="font-semibold">На оценку влияют</p>
            <ul className="mt-5 border-t border-white/20">{service.price.factors.map((factor, index) => <li key={factor} className="grid grid-cols-[2.5rem_1fr] border-b border-white/20 py-4 text-white/80"><span className="text-[#a99cff]">{number(index)}</span>{factor}</li>)}</ul>
          </div>}
        </div>}
      </Section>
    </ServiceSection>}

    {service.impactMetrics.length > 0 && <ServiceSection name="metrics" className="border-y border-border bg-[#eef1ff] dark:bg-[#18152b]">
      <Section>
        <SectionHeading eyebrow="Измеримый результат" title="Как измеряем эффект" description="Фиксируем исходные значения до разработки и повторяем измерение после стабилизации рабочего процесса." />
        <div className="mt-12"><BlockList items={service.impactMetrics} accent /></div>
      </Section>
    </ServiceSection>}

    {service.relatedCases.length > 0 && <ServiceSection name="cases" className="border-y border-border bg-[#f5f6f9] dark:bg-[#111722]">
      <Section>
        <SectionHeading eyebrow="Практика" title={isBusinessAutomation
          ? "Кейсы автоматизации бизнес-процессов"
          : isCrmDevelopment
            ? "Кейсы разработки CRM-систем"
            : isWebServices
              ? "Кейсы разработки веб-сервисов и личных кабинетов"
              : isMobileAppDevelopment
                ? "Кейсы разработки мобильных приложений"
                : isAiAutomation
                  ? "Кейсы внедрения ИИ и AI-автоматизации"
                  : isSupportDevelopment ? "Кейсы поддержки и развития сайтов и веб-сервисов" : "Проекты, где это уже работает"} description="Показываем не абстрактные возможности, а решения, которые используются в реальном бизнесе." />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">{service.relatedCases.map((project, index) => <CaseCard key={project.slug} project={project} tone={index % 2 ? "green" : "violet"} />)}</div>
      </Section>
    </ServiceSection>}

    {service.results.length > 0 && <ServiceSection name="results">
      <Section>
        <SectionHeading eyebrow="Эффект" title={isCrmDevelopment
          ? "Что получает бизнес после внедрения CRM"
          : isWebServices
            ? "Что получает бизнес после запуска веб-сервиса"
            : isMobileAppDevelopment
              ? "Что получает бизнес после запуска приложения"
              : isAiAutomation
                ? "Что получает бизнес после внедрения ИИ"
                : isSupportDevelopment ? "Что получает бизнес после стабилизации продукта" : "Что меняется после запуска"} />
        <div className="mt-12"><BlockList items={service.results} accent /></div>
      </Section>
    </ServiceSection>}

    {service.guarantees.length > 0 && <ServiceSection name="guarantees" className="border-y border-border">
      <Section>
        <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:gap-20">
          <SectionHeading eyebrow="Ответственность" title="Гарантии и поддержка" description="Заранее договариваемся о результате этапов и остаёмся рядом после запуска." />
          <div><BlockList items={service.guarantees} /></div>
        </div>
      </Section>
    </ServiceSection>}

    {service.recommendedReading.length > 0 && <ServiceSection name="reading" className="border-y border-border bg-[#0b1020] text-white">
      <Section>
        <SectionHeading eyebrow="Библиотека" title="Что рекомендуем изучить" description="Книги и профессиональные руководства, на которых основан наш подход к анализу и улучшению процессов." tone="inverse" />
        <div className="mt-12"><BlockList items={service.recommendedReading} inverted /></div>
      </Section>
    </ServiceSection>}

    {service.faq.length > 0 && <ServiceSection name="faq">
      <Section>
        <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:gap-20">
          <SectionHeading eyebrow="FAQ" title="Частые вопросы" />
          <FaqList items={service.faq} />
        </div>
      </Section>
    </ServiceSection>}

    {service.relatedArticles.length > 0 && <ServiceSection name="articles" className="border-y border-border bg-[#f5f6f9] dark:bg-[#111722]">
      <Section>
        <SectionHeading eyebrow="Экспертиза" title="Материалы по теме" />
        <div className="mt-12 grid gap-5 md:grid-cols-3">{service.relatedArticles.map(post => <ContentCard key={post.slug} post={post} />)}</div>
      </Section>
    </ServiceSection>}

    <ServiceSection name="meeting">
      <Section>
        <SectionHeading eyebrow="Без обязательств" title="Как пройдёт первая встреча" description="За один разговор поймём контекст и определим, есть ли смысл двигаться дальше вместе." />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-[2rem] bg-border sm:grid-cols-2 lg:grid-cols-3">
          {MEETING_STEPS.map((step, index) => <li key={step} data-meeting-step className="min-h-48 bg-card p-7 sm:p-8">
            <span className="text-sm font-semibold tracking-[0.16em] text-[var(--public-violet)]">{number(index)}</span>
            <p className="mt-10 max-w-sm text-xl font-semibold leading-tight tracking-[-0.025em]">{step}</p>
          </li>)}
        </ol>
      </Section>
    </ServiceSection>

    <ServiceSection name="lead">
      <LeadCtaSection pagePath={pathname} title={service.cta.title ?? "Расскажите о вашей задаче"} description={service.cta.text ?? undefined} />
    </ServiceSection>
  </article>;
}
