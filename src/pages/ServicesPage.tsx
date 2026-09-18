import React from "react";
import { ServiceCard } from "../components/public/ServiceCard";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section, SectionHeading } from "../components/public/Section";
import type { ServiceCardView } from "../server/content/types";

export function ServicesPage({ services }: { services: ServiceCardView[] }) {
  return <>
    <Section className="pt-28 sm:pt-32">
      <SectionHeading
        level={1}
        eyebrow="Услуги"
        title="Цифровые решения для рабочих процессов бизнеса"
        description="Проектируем и развиваем веб-сервисы, мобильные приложения, CRM и интеграции — от первой схемы до запуска и поддержки."
      />
    </Section>
    {services.length > 0 && <Section className="border-t border-border pt-12 lg:pt-16">
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {services.map(service => <ServiceCard key={service.slug} service={service} />)}
      </div>
    </Section>}
    <LeadCtaSection pagePath="/services/" title="Обсудим ваш проект" description="Опишите задачу — предложим следующий шаг в течение рабочего дня." />
  </>;
}
