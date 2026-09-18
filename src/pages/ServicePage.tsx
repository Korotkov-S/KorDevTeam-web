import React from "react";
import { Link } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { CaseCard } from "../components/public/CaseCard";
import { ContentCard } from "../components/public/ContentCard";
import { FaqList } from "../components/public/FaqList";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section, SectionHeading } from "../components/public/Section";
import type { BlockView, ServicePageView } from "../server/content/types";

export const SERVICE_SECTION_ORDER = [
  "hero", "problems", "solutions", "integrations", "process",
  "cases", "results", "guarantees", "faq", "lead", "articles",
] as const;

function TextList({ items }: { items: string[] }) {
  return <ul className="grid gap-3 md:grid-cols-2">
    {items.map(item => <li key={item} className="rounded-[var(--public-radius-card)] border border-border bg-card p-5 leading-7">{item}</li>)}
  </ul>;
}

function BlockList({ items }: { items: BlockView[] }) {
  return <ol className="grid gap-4 md:grid-cols-2">
    {items.map(item => <li key={`${item.title}:${item.description}`} className="rounded-[var(--public-radius-card)] border border-border p-6">
      <h3 className="text-xl font-semibold tracking-tight">{item.title}</h3>
      <p className="mt-3 leading-7 text-[var(--public-subtle)]">{item.description}</p>
    </li>)}
  </ol>;
}

function ServiceSection({ name, children }: { name: typeof SERVICE_SECTION_ORDER[number]; children: React.ReactNode }) {
  return <div data-service-section={name}>{children}</div>;
}

export function ServicePage({ pathname, service }: { pathname: string; service: ServicePageView }) {
  const hasSolutions = service.solutions.length > 0 || Boolean(service.bodyMd.trim());
  const hasIntegrations = service.integrations.length > 0 || service.technologies.length > 0;
  const hasProcess = service.processSteps.length > 0 || service.price !== null;

  return <article>
    <ServiceSection name="hero">
      <Section className="pt-28 sm:pt-32">
        <nav aria-label="Хлебные крошки" className="mb-8 text-sm text-[var(--public-subtle)]">
          <Link className="underline underline-offset-4" to="/services/">Услуги</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{service.h1}</span>
        </nav>
        <SectionHeading level={1} eyebrow="Направление" title={service.h1} description={service.lead} />
        <a
          href="#contact"
          data-event-name="service_cta_click"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--public-blue)] px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--public-violet)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-blue)]"
        >Обсудить задачу</a>
      </Section>
    </ServiceSection>

    {service.problems.length > 0 && <ServiceSection name="problems">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="Задачи" title="Что решаем" />
        <div className="mt-8"><TextList items={service.problems} /></div>
      </Section>
    </ServiceSection>}

    {hasSolutions && <ServiceSection name="solutions">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="Решение" title="Что делаем" />
        {service.solutions.length > 0 && <div className="mt-8"><TextList items={service.solutions} /></div>}
        {service.bodyMd.trim() && <MarkdownContent markdown={service.bodyMd} proseClassName="mt-10 max-w-4xl" />}
      </Section>
    </ServiceSection>}

    {hasIntegrations && <ServiceSection name="integrations">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="Среда" title="Интеграции и технологии" />
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {service.integrations.length > 0 && <div><h3 className="mb-4 text-lg font-semibold">Интеграции</h3><TextList items={service.integrations} /></div>}
          {service.technologies.length > 0 && <div><h3 className="mb-4 text-lg font-semibold">Технологии</h3><TextList items={service.technologies} /></div>}
        </div>
      </Section>
    </ServiceSection>}

    {hasProcess && <ServiceSection name="process">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="Процесс" title="Как работаем" />
        {service.processSteps.length > 0 && <div className="mt-8"><BlockList items={service.processSteps} /></div>}
        {service.price && <div className="mt-8 rounded-[var(--public-radius-card)] bg-[color:color-mix(in_srgb,var(--public-blue)_8%,var(--card))] p-6 sm:p-8">
          <h3 className="text-xl font-semibold">Оценка проекта</h3>
          {service.price.from !== null && <p className="mt-3">Стоимость от {new Intl.NumberFormat("ru-RU").format(service.price.from)} ₽</p>}
          {service.price.timeRange && <p className="mt-2 text-[var(--public-subtle)]">Срок: {service.price.timeRange}</p>}
          {service.price.factors.length > 0 && <><p className="mt-4 font-medium">На оценку влияют:</p><ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--public-subtle)]">{service.price.factors.map(factor => <li key={factor}>{factor}</li>)}</ul></>}
        </div>}
      </Section>
    </ServiceSection>}

    {service.relatedCases.length > 0 && <ServiceSection name="cases">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="Практика" title="Связанные кейсы" />
        <div className="mt-8 grid gap-5 md:grid-cols-2">{service.relatedCases.map((project, index) => <CaseCard key={project.slug} project={project} tone={index % 2 ? "green" : "violet"} />)}</div>
      </Section>
    </ServiceSection>}

    {service.results.length > 0 && <ServiceSection name="results">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="Эффект" title="Результат" />
        <div className="mt-8"><BlockList items={service.results} /></div>
      </Section>
    </ServiceSection>}

    {service.guarantees.length > 0 && <ServiceSection name="guarantees">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="Условия" title="Гарантии и поддержка" />
        <div className="mt-8"><BlockList items={service.guarantees} /></div>
      </Section>
    </ServiceSection>}

    {service.faq.length > 0 && <ServiceSection name="faq">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="FAQ" title="Частые вопросы" />
        <div className="mt-8"><FaqList items={service.faq} /></div>
      </Section>
    </ServiceSection>}

    <ServiceSection name="lead">
      <LeadCtaSection pagePath={pathname} title={service.cta.title ?? "Расскажите о вашей задаче"} description={service.cta.text ?? undefined} />
    </ServiceSection>

    {service.relatedArticles.length > 0 && <ServiceSection name="articles">
      <Section className="border-t border-border">
        <SectionHeading eyebrow="Блог" title="Материалы по теме" />
        <div className="mt-8 grid gap-5 md:grid-cols-3">{service.relatedArticles.map(post => <ContentCard key={post.slug} post={post} />)}</div>
      </Section>
    </ServiceSection>}
  </article>;
}
