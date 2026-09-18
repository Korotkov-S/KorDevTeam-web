import React from "react";
import { Link } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { CaseCard } from "../components/public/CaseCard";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section, SectionHeading } from "../components/public/Section";
import { ServiceCard } from "../components/public/ServiceCard";
import type { BlockView, CommercialCaseView } from "../server/content/types";

type CaseSectionName = "hero" | "problem" | "solution" | "stages" | "team" | "screenshots" | "results" | "testimonial" | "services" | "cases" | "lead";

function CaseSection({ name, children }: { name: CaseSectionName; children: React.ReactNode }) {
  return <div data-case-section={name}>{children}</div>;
}

function TextList({ items }: { items: string[] }) {
  return <ul className="grid gap-3 md:grid-cols-2">{items.map(item => <li key={item} className="rounded-[var(--public-radius-card)] border border-border bg-card p-5 leading-7">{item}</li>)}</ul>;
}

function BlockList({ items }: { items: BlockView[] }) {
  return <ol className="grid gap-4 md:grid-cols-2">{items.map(item => <li key={`${item.title}:${item.description}`} className="rounded-[var(--public-radius-card)] border border-border p-6">
    <h3 className="text-xl font-semibold tracking-tight">{item.title}</h3>
    <p className="mt-3 leading-7 text-[var(--public-subtle)]">{item.description}</p>
  </li>)}</ol>;
}

export function CommercialCasePage({ pathname, project }: { pathname: string; project: CommercialCaseView }) {
  const hasProblem = Boolean(project.problem) || project.constraints.length > 0;
  const hasSolution = Boolean(project.solution || project.architecture || project.bodyMd.trim())
    || project.integrations.length > 0 || project.technologies.length > 0 || project.features.length > 0;

  return <article>
    <CaseSection name="hero">
      <Section className="pt-28 sm:pt-32">
        <nav aria-label="Хлебные крошки" className="mb-8 text-sm text-[var(--public-subtle)]">
          <Link className="underline underline-offset-4" to="/cases/">Кейсы</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{project.h1}</span>
        </nav>
        <SectionHeading level={1} eyebrow="Кейс" title={project.h1} description={project.summary} />
        {(project.demoUrl || project.githubUrl) && <div className="mt-8 flex flex-wrap gap-4">
          {project.demoUrl && <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-[var(--public-blue)] px-5 py-3 text-sm font-semibold text-white">Открыть проект</a>}
          {project.githubUrl && <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 py-3 text-sm font-semibold text-[var(--public-blue)]">Исходный код</a>}
        </div>}
      </Section>
    </CaseSection>

    {hasProblem && <CaseSection name="problem"><Section className="border-t border-border">
      <SectionHeading eyebrow="Контекст" title="Задача" />
      {project.problem && <MarkdownContent markdown={project.problem} proseClassName="mt-8 max-w-4xl" />}
      {project.constraints.length > 0 && <div className="mt-8"><h3 className="mb-4 text-lg font-semibold">Ограничения</h3><TextList items={project.constraints} /></div>}
    </Section></CaseSection>}

    {hasSolution && <CaseSection name="solution"><Section className="border-t border-border">
      <SectionHeading eyebrow="Подход" title="Решение" />
      {project.solution && <MarkdownContent markdown={project.solution} proseClassName="mt-8 max-w-4xl" />}
      {project.architecture && <div className="mt-8"><h3 className="text-lg font-semibold">Архитектура</h3><MarkdownContent markdown={project.architecture} proseClassName="mt-3 max-w-4xl" /></div>}
      {project.features.length > 0 && <div className="mt-8"><h3 className="mb-4 text-lg font-semibold">Возможности</h3><TextList items={project.features} /></div>}
      {(project.integrations.length > 0 || project.technologies.length > 0) && <div className="mt-8 grid gap-8 md:grid-cols-2">
        {project.integrations.length > 0 && <div><h3 className="mb-4 text-lg font-semibold">Интеграции</h3><TextList items={project.integrations} /></div>}
        {project.technologies.length > 0 && <div><h3 className="mb-4 text-lg font-semibold">Технологии</h3><TextList items={project.technologies} /></div>}
      </div>}
      {project.bodyMd.trim() && <MarkdownContent markdown={project.bodyMd} proseClassName="mt-10 max-w-4xl" />}
    </Section></CaseSection>}

    {project.stages.length > 0 && <CaseSection name="stages"><Section className="border-t border-border">
      <SectionHeading eyebrow="Реализация" title="Этапы проекта" /><div className="mt-8"><BlockList items={project.stages} /></div>
    </Section></CaseSection>}

    {project.team.length > 0 && <CaseSection name="team"><Section className="border-t border-border">
      <SectionHeading eyebrow="Команда" title="Кто работал над проектом" /><div className="mt-8"><TextList items={project.team} /></div>
    </Section></CaseSection>}

    {project.screenshots.length > 0 && <CaseSection name="screenshots"><Section className="border-t border-border">
      <SectionHeading eyebrow="Интерфейс" title="Скриншоты" />
      <div className="mt-8 grid gap-5 md:grid-cols-2">{project.screenshots.map(image => <img key={image.id} src={image.src} srcSet={image.srcSet || undefined} sizes={image.sizes} width={image.width ?? undefined} height={image.height ?? undefined} alt={image.alt} loading="lazy" className="w-full rounded-[var(--public-radius-card)] border border-border object-cover" />)}</div>
    </Section></CaseSection>}

    {project.results.length > 0 && <CaseSection name="results"><Section className="border-t border-border">
      <SectionHeading eyebrow="Подтверждённый эффект" title="Результаты" /><div className="mt-8"><BlockList items={project.results} /></div>
    </Section></CaseSection>}

    {project.testimonial && <CaseSection name="testimonial"><Section className="border-t border-border">
      <SectionHeading eyebrow="Обратная связь" title="Отзыв клиента" />
      <blockquote className="mt-8 max-w-4xl rounded-[var(--public-radius-card)] bg-[color:color-mix(in_srgb,var(--public-green)_10%,var(--card))] p-6 text-xl leading-8 sm:p-8">{project.testimonial}</blockquote>
    </Section></CaseSection>}

    {project.relatedServices.length > 0 && <CaseSection name="services"><Section className="border-t border-border">
      <SectionHeading eyebrow="Что сделали" title="Связанные услуги" />
      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{project.relatedServices.map(service => <ServiceCard key={service.slug} service={service} />)}</div>
    </Section></CaseSection>}

    {project.relatedCases.length > 0 && <CaseSection name="cases"><Section className="border-t border-border">
      <SectionHeading eyebrow="Ещё практика" title="Другие кейсы" />
      <div className="mt-8 grid gap-5 md:grid-cols-2">{project.relatedCases.map((item, index) => <CaseCard key={item.slug} project={item} tone={index % 2 ? "green" : "violet"} />)}</div>
    </Section></CaseSection>}

    <CaseSection name="lead"><LeadCtaSection pagePath={pathname} title={project.cta.title ?? "Обсудить похожую задачу"} description={project.cta.text ?? undefined} /></CaseSection>
  </article>;
}
