import React from "react";
import { Link } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { CaseCard } from "../components/public/CaseCard";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section } from "../components/public/Section";
import { ServiceCard } from "../components/public/ServiceCard";
import type { BlockView, CommercialCaseView } from "../server/content/types";

type CaseSectionName = "hero" | "problem" | "solution" | "stages" | "team" | "screenshots" | "results" | "testimonial" | "services" | "cases" | "lead";

function CaseSection({ name, id, children }: { name: CaseSectionName; id?: string; children: React.ReactNode }) {
  return <div id={id} data-case-section={name}>{children}</div>;
}

function StorySection({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <Section className="border-t border-border py-14 lg:py-20">
      <div className="grid gap-9 lg:grid-cols-12 lg:gap-8">
        <header className="lg:col-span-4">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--public-violet)]">{eyebrow}</p>
          <h2 className="mt-4 text-balance text-4xl font-semibold leading-[.95] tracking-[-0.055em] text-[var(--public-ink)] sm:text-6xl">{title}</h2>
        </header>
        <div className="lg:col-span-7 lg:col-start-6">{children}</div>
      </div>
    </Section>
  );
}

function TextList({ items }: { items: string[] }) {
  return (
    <ul className="border-t border-border">
      {items.map(item => (
        <li key={item} className="grid grid-cols-[1.5rem_1fr] gap-3 border-b border-border py-5 text-lg leading-7 sm:text-xl">
          <span aria-hidden="true" className="mt-2 size-2 rounded-full bg-[var(--public-violet)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BlockList({ items }: { items: BlockView[] }) {
  return (
    <ol className="border-t border-border">
      {items.map((item, index) => (
        <li key={`${item.title}:${item.description}`} className="grid gap-4 border-b border-border py-7 sm:grid-cols-[4rem_1fr]">
          <span className="text-sm font-semibold text-[var(--public-violet)]">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3 className="text-2xl font-semibold tracking-[-0.035em]">{item.title}</h3>
            <p className="mt-3 text-lg leading-8 text-[var(--public-subtle)]">{item.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function hasDistinctCaption(alt: string, heading: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru");
  return normalize(alt) !== normalize(heading);
}

function CaseScreenshotSlider({ images, heading }: { images: CommercialCaseView["screenshots"]; heading: string }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const touchStartX = React.useRef<number | null>(null);
  const hasNavigation = images.length > 1;

  const showPrevious = () => setActiveIndex(index => (index - 1 + images.length) % images.length);
  const showNext = () => setActiveIndex(index => (index + 1) % images.length);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasNavigation) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPrevious();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showNext();
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!hasNavigation || touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) return;
    const distance = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 45) return;
    if (distance < 0) showNext();
    else showPrevious();
  };

  return (
    <div
      role="region"
      aria-label="Скриншоты продукта"
      aria-roledescription="карусель"
      tabIndex={hasNavigation ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onTouchStart={event => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={handleTouchEnd}
      className="mt-10 rounded-[2rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--public-blue)] sm:rounded-[3rem]"
    >
      <div className="relative">
        {images.map((image, index) => (
          <figure key={image.id} hidden={index !== activeIndex} aria-label={`${index + 1} из ${images.length}`}>
            <div className="flex aspect-[4/5] overflow-hidden rounded-[2rem] border border-border bg-[#eef2f7] p-3 dark:bg-[#151b2a] sm:aspect-[16/10] sm:rounded-[3rem] sm:p-6">
              <img
                src={image.src}
                srcSet={image.srcSet || undefined}
                sizes={image.sizes}
                width={image.width ?? undefined}
                height={image.height ?? undefined}
                alt={image.alt}
                loading="eager"
                className="h-full w-full rounded-[1.25rem] object-contain sm:rounded-[2rem]"
              />
            </div>
            {hasDistinctCaption(image.alt, heading) ? <figcaption className="mt-4 max-w-3xl px-2 text-base leading-6 text-[var(--public-subtle)]">{image.alt}</figcaption> : null}
          </figure>
        ))}

        {hasNavigation ? (
          <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between sm:inset-x-6">
            <button
              type="button"
              aria-label="Предыдущий скриншот"
              onClick={showPrevious}
              className="pointer-events-auto grid size-12 place-items-center rounded-full border border-white/25 bg-[#0b1020]/85 text-xl text-white shadow-lg backdrop-blur transition-colors hover:bg-[var(--public-violet)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-blue)] sm:size-14"
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              type="button"
              aria-label="Следующий скриншот"
              onClick={showNext}
              className="pointer-events-auto grid size-12 place-items-center rounded-full border border-white/25 bg-[#0b1020]/85 text-xl text-white shadow-lg backdrop-blur transition-colors hover:bg-[var(--public-violet)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-blue)] sm:size-14"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : null}
      </div>

      {hasNavigation ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border px-2 pt-5">
          <p aria-live="polite" className="text-sm font-semibold tabular-nums text-[var(--public-subtle)]">{activeIndex + 1} / {images.length}</p>
          <div className="flex flex-wrap items-center justify-end gap-2" aria-label="Выбор скриншота">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                aria-label={`Показать скриншот ${index + 1}: ${image.alt}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
                className="h-2.5 w-8 rounded-full bg-[color:color-mix(in_srgb,var(--public-ink)_16%,transparent)] transition-[width,background-color] hover:bg-[var(--public-blue)] aria-current:w-12 aria-current:bg-[var(--public-violet)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--public-blue)]"
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CommercialCasePage({ pathname, project }: { pathname: string; project: CommercialCaseView }) {
  const hasProblem = Boolean(project.problem) || project.constraints.length > 0;
  const hasSolution = Boolean(project.solution || project.architecture || project.bodyMd.trim())
    || project.integrations.length > 0 || project.technologies.length > 0 || project.features.length > 0;
  const index = [
    project.screenshots.length ? ["Интерфейс", "#case-screenshots"] : null,
    hasProblem ? ["Задача", "#case-problem"] : null,
    project.results.length ? ["Результаты", "#case-results"] : null,
    hasSolution ? ["Решение", "#case-solution"] : null,
    project.stages.length ? ["Этапы", "#case-stages"] : null,
    project.team.length ? ["Команда", "#case-team"] : null,
  ].filter((item): item is string[] => Boolean(item));

  return (
    <article>
      <CaseSection name="hero">
        <Section className="pt-28 pb-12 sm:pt-32 lg:pb-16">
          <nav aria-label="Хлебные крошки" className="mb-8 text-sm text-[var(--public-subtle)]">
            <Link className="underline underline-offset-4" to="/cases/">Кейсы</Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{project.h1}</span>
          </nav>

          <div className="overflow-hidden rounded-[2rem] bg-[#dfe8ff] px-6 py-9 text-[#0b1020] dark:bg-[#18243c] dark:text-white sm:rounded-[3rem] sm:px-10 sm:py-12 lg:px-14 lg:py-16">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#6541d8] dark:text-[#b7a7ff]">Кейс KorDevTeam</p>
            <h1 className="mt-7 max-w-[17ch] text-balance text-[clamp(3rem,7vw,7rem)] font-semibold leading-[.9] tracking-[-0.065em]">{project.h1}</h1>
            <div className="mt-9 grid gap-7 border-t border-black/15 pt-7 dark:border-white/15 lg:grid-cols-12">
              <p className="max-w-3xl text-xl leading-8 text-[#3f4a60] dark:text-[#c0c8d8] sm:text-2xl lg:col-span-8">{project.summary}</p>
              {(project.demoUrl || project.githubUrl) ? (
                <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
                  {project.demoUrl ? <a href={project.demoUrl} aria-label="Открыть проект" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-full bg-[var(--public-blue)] px-6 py-3 text-sm font-semibold text-[var(--public-action-foreground)] hover:bg-[var(--public-violet)]">Открыть проект ↗</a> : null}
                  {project.githubUrl ? <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-full border border-current px-6 py-3 text-sm font-semibold">Исходный код ↗</a> : null}
                </div>
              ) : null}
            </div>
          </div>

          {index.length ? (
            <nav aria-label="Навигация по кейсу" className="mt-6 border-y border-border">
              <ul className="flex flex-wrap gap-x-8 gap-y-1 py-4">
                {index.map(([label, href], itemIndex) => (
                  <li key={href} className="inline-flex items-center text-sm font-semibold uppercase tracking-[0.09em]">
                    <span aria-hidden="true" className="mr-2 text-[var(--public-violet)]">{String(itemIndex + 1).padStart(2, "0")}</span>
                    <a href={href} className="py-2 text-[var(--public-subtle)] hover:text-[var(--public-ink)]">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </Section>
      </CaseSection>

      {project.screenshots.length ? <CaseSection name="screenshots" id="case-screenshots">
        <Section className="border-t border-border py-14 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--public-violet)]">Интерфейс</p>
          <h2 className="mt-4 text-5xl font-semibold leading-[.95] tracking-[-0.055em] sm:text-7xl">Продукт в работе</h2>
          <CaseScreenshotSlider key={project.slug} images={project.screenshots} heading={project.h1} />
        </Section>
      </CaseSection> : null}

      {hasProblem ? <CaseSection name="problem" id="case-problem">
        <StorySection eyebrow="Контекст" title="Задача">
          {project.problem ? <MarkdownContent markdown={project.problem} media={project.media} /> : null}
          {project.constraints.length ? <div className="mt-10"><h3 className="mb-5 text-2xl font-semibold tracking-[-0.03em]">Ограничения</h3><TextList items={project.constraints} /></div> : null}
        </StorySection>
      </CaseSection> : null}

      {project.results.length ? <CaseSection name="results" id="case-results">
        <Section className="border-t border-border py-14 lg:py-20">
          <div className="rounded-[2rem] bg-[#0b1020] px-6 py-10 text-white sm:rounded-[3rem] sm:px-10 lg:px-14 lg:py-14">
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#b7a7ff]">Подтверждённый эффект</p>
            <h2 className="mt-4 text-5xl font-semibold leading-[.95] tracking-[-0.055em] sm:text-7xl">Результаты</h2>
            <div className="mt-10 [&_ol]:border-white/20 [&_li]:border-white/20 [&_p]:text-white/70"><BlockList items={project.results} /></div>
          </div>
        </Section>
      </CaseSection> : null}

      {hasSolution ? <CaseSection name="solution" id="case-solution">
        <StorySection eyebrow="Подход" title="Решение">
          {project.solution ? <MarkdownContent markdown={project.solution} media={project.media} /> : null}
          {project.architecture ? <div className="mt-10"><h3 className="text-2xl font-semibold tracking-[-0.03em]">Архитектура</h3><MarkdownContent markdown={project.architecture} media={project.media} proseClassName="mt-4" /></div> : null}
          {project.features.length ? <div className="mt-10"><h3 className="mb-5 text-2xl font-semibold tracking-[-0.03em]">Возможности</h3><TextList items={project.features} /></div> : null}
          {(project.integrations.length || project.technologies.length) ? <div className="mt-12 grid gap-10 sm:grid-cols-2">
            {project.integrations.length ? <div><h3 className="mb-5 text-2xl font-semibold tracking-[-0.03em]">Интеграции</h3><TextList items={project.integrations} /></div> : null}
            {project.technologies.length ? <div><h3 className="mb-5 text-2xl font-semibold tracking-[-0.03em]">Технологии</h3><TextList items={project.technologies} /></div> : null}
          </div> : null}
          {project.bodyMd.trim() ? <MarkdownContent markdown={project.bodyMd} media={project.media} proseClassName="mt-12" /> : null}
        </StorySection>
      </CaseSection> : null}

      {project.stages.length ? <CaseSection name="stages" id="case-stages"><StorySection eyebrow="Реализация" title="Этапы проекта"><BlockList items={project.stages} /></StorySection></CaseSection> : null}

      {project.team.length ? <CaseSection name="team" id="case-team"><StorySection eyebrow="Команда" title="Кто работал над проектом"><TextList items={project.team} /></StorySection></CaseSection> : null}

      {project.testimonial ? <CaseSection name="testimonial"><StorySection eyebrow="Обратная связь" title="Отзыв клиента"><blockquote className="text-3xl leading-[1.35] tracking-[-0.03em] sm:text-4xl">{project.testimonial}</blockquote></StorySection></CaseSection> : null}

      {project.relatedServices.length ? <CaseSection name="services"><Section className="border-t border-border py-14 lg:py-20"><p className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--public-violet)]">Что сделали</p><h2 className="mt-4 text-5xl font-semibold leading-[.95] tracking-[-0.055em] sm:text-7xl">Связанные услуги</h2><div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{project.relatedServices.map(service => <ServiceCard key={service.slug} service={service} />)}</div></Section></CaseSection> : null}

      {project.relatedCases.length ? <CaseSection name="cases"><Section className="border-t border-border py-14 lg:py-20"><p className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--public-violet)]">Ещё практика</p><h2 className="mt-4 text-5xl font-semibold leading-[.95] tracking-[-0.055em] sm:text-7xl">Другие кейсы</h2><div className="mt-10 grid gap-5 md:grid-cols-2">{project.relatedCases.map((item, index) => <CaseCard key={item.slug} project={item} tone={index % 2 ? "green" : "violet"} />)}</div></Section></CaseSection> : null}

      <CaseSection name="lead"><LeadCtaSection pagePath={pathname} title={project.cta.title ?? "Обсудить похожую задачу"} description={project.cta.text ?? undefined} /></CaseSection>
    </article>
  );
}
