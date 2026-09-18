import React from "react";
import { HomeHero } from "../components/home/HomeHero";
import { ProofStrip } from "../components/home/ProofStrip";
import { ProductFeature } from "../components/home/ProductFeature";
import { ProcessSteps } from "../components/home/ProcessSteps";
import { CaseCard } from "../components/public/CaseCard";
import { ServiceCard } from "../components/public/ServiceCard";
import { ContentCard } from "../components/public/ContentCard";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section, SectionHeading } from "../components/public/Section";
import { CtaLink } from "../components/public/CtaLink";
import type { CaseCardView, ContentCardView, ServiceCardView } from "../server/content/types";

export function HomePage({ services = [], projects = [], posts = [] }: {
  services?: ServiceCardView[]; projects?: CaseCardView[]; posts?: ContentCardView[];
}) {
  return <>
    <HomeHero />
    <ProofStrip />
    {projects.length > 0 && <Section id="cases">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading eyebrow="Практика" title="Задачи бизнеса. Работающие решения." description="Веб-сервисы, приложения и интеграции — от задачи до реализации." />
        <CtaLink to="/cases/" variant="secondary">Все кейсы</CtaLink>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">{projects.map((project, index) => <CaseCard key={project.slug} project={project} tone={index % 3 === 0 ? "violet" : index % 3 === 1 ? "green" : "neutral"} />)}</div>
    </Section>}
    {services.length > 0 && <Section id="services" className="border-t border-border">
      <SectionHeading eyebrow="Что мы делаем" title="Технологии под вашу задачу" description="Соединяем процессы, данные и людей. Создаём инструменты для повседневной работы бизнеса." />
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{services.map(service => <ServiceCard key={service.slug} service={service} />)}</div>
      <div className="mt-8"><CtaLink to="/services/" variant="secondary">Все услуги</CtaLink></div>
    </Section>}
    <ProductFeature />
    <ProcessSteps />
    {posts.length > 0 && <Section id="insights" className="border-t border-border">
      <SectionHeading eyebrow="Делимся опытом" title="О технологиях через практику" description="Разбираем автоматизацию, разработку и работу с цифровыми продуктами." />
      <div className="mt-10 grid gap-5 md:grid-cols-3">{posts.map(post => <ContentCard key={post.slug} post={post} />)}</div>
      <div className="mt-8 flex flex-wrap gap-3">
        <CtaLink to="/blog/" variant="secondary">Все статьи</CtaLink>
        <CtaLink to="/journal/" variant="secondary">Журнал</CtaLink>
        <CtaLink to="/video/" variant="secondary">Видео</CtaLink>
      </div>
    </Section>}
    <LeadCtaSection pagePath="/" />
  </>;
}
