import React, { useState } from "react";
import { CaseCard } from "../components/public/CaseCard";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section, SectionHeading } from "../components/public/Section";
import type { CaseCardView, CaseCategory } from "../server/content/types";

const filters: Array<{ id: "all" | CaseCategory; label: string }> = [
  { id: "all", label: "Все проекты" },
  { id: "automation", label: "Автоматизация и интеграции" },
  { id: "crm", label: "CRM и внутренние системы" },
  { id: "mobile", label: "Мобильные приложения" },
  { id: "web-service", label: "Веб-сервисы" },
  { id: "commerce", label: "Интернет-магазины и сайты" },
  { id: "support", label: "Техническая поддержка" },
  { id: "own-product", label: "Собственные продукты" },
];

function projectCount(value: number): string {
  const lastTwo = value % 100;
  const last = value % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "проектов" : last === 1 ? "проект" : last >= 2 && last <= 4 ? "проекта" : "проектов";
  return `${value} ${noun}`;
}

export function CasesPage({ projects }: { projects: CaseCardView[] }) {
  const [selected, setSelected] = useState<"all" | CaseCategory>("all");
  const visibleProjects = selected === "all" ? projects : projects.filter(project => project.categories?.includes(selected));

  return <>
    <Section className="pt-28 sm:pt-32">
      <SectionHeading
        level={1}
        eyebrow="Кейсы"
        title="Цифровые продукты, которые решают рабочие задачи"
        description="Показываем исходную задачу, принятое решение и только подтверждённые результаты проекта."
      />
    </Section>
    {projects.length > 0 && <Section className="border-t border-border pt-12 lg:pt-16">
      <div className="mb-9 flex items-end justify-between gap-6">
        <div className="min-w-0 overflow-x-auto pb-2" role="group" aria-label="Фильтр кейсов">
          <div className="flex w-max gap-2">
            {filters.map(filter => <button
              key={filter.id}
              type="button"
              aria-pressed={selected === filter.id}
              onClick={() => setSelected(filter.id)}
              className="min-h-11 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--public-blue)] hover:text-[var(--public-blue)] aria-pressed:border-[var(--public-blue)] aria-pressed:bg-[var(--public-blue)] aria-pressed:text-[var(--public-action-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2"
            >{filter.label}</button>)}
          </div>
        </div>
        <p aria-live="polite" className="shrink-0 pb-3 text-sm text-[var(--public-subtle)]">{projectCount(visibleProjects.length)}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {visibleProjects.map((project, index) => <CaseCard key={project.slug} project={project} tone={index % 3 === 0 ? "violet" : index % 3 === 1 ? "green" : "neutral"} />)}
      </div>
    </Section>}
    <LeadCtaSection pagePath="/cases/" title="Есть похожая задача?" description="Опишите контекст — предложим следующий шаг в течение рабочего дня." />
  </>;
}
