import React from "react";
import { CaseCard } from "../components/public/CaseCard";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section, SectionHeading } from "../components/public/Section";
import type { CaseCardView } from "../server/content/types";

export function CasesPage({ projects }: { projects: CaseCardView[] }) {
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
      <div className="grid gap-5 md:grid-cols-2">
        {projects.map((project, index) => <CaseCard key={project.slug} project={project} tone={index % 3 === 0 ? "violet" : index % 3 === 1 ? "green" : "neutral"} />)}
      </div>
    </Section>}
    <LeadCtaSection pagePath="/cases/" title="Есть похожая задача?" description="Опишите контекст — предложим следующий шаг в течение рабочего дня." />
  </>;
}
