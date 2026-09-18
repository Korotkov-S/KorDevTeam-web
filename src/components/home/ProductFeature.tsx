import React from "react";
import { Section, SectionHeading } from "../public/Section";
import { CtaLink } from "../public/CtaLink";

export function ProductFeature() {
  return <Section id="krasotula">
    <div className="grid items-center gap-8 rounded-[var(--public-radius-card)] border border-border bg-card p-6 sm:p-10 lg:grid-cols-2">
      <div>
        <SectionHeading eyebrow="Собственный продукт" title="Krasotula CRM" description="CRM для малого бизнеса: клиенты, продажи, задачи и онлайн-запись в одной системе. Развиваем свой продукт и переносим этот опыт в заказную разработку." />
        <ul className="my-7 grid grid-cols-2 gap-3 text-sm text-[var(--public-subtle)]">
          {["Клиенты и сделки", "Задачи и воронки", "Онлайн-запись", "Чаты и рассылки"].map(feature => <li key={feature} className="border-t border-border pt-3">{feature}</li>)}
        </ul>
        <div className="flex flex-wrap gap-3">
          <CtaLink to="https://krasotula.com">Посмотреть продукт ↗</CtaLink>
          <CtaLink to="/#contact" variant="secondary">Обсудить внедрение</CtaLink>
        </div>
      </div>
      <img src="/products/krasotulya-crm-capabilities-hero.webp" srcSet="/products/krasotulya-crm-capabilities-hero-640.webp 640w, /products/krasotulya-crm-capabilities-hero-960.webp 960w, /products/krasotulya-crm-capabilities-hero.webp 1600w" sizes="(min-width: 1024px) 45vw, 100vw" width={1600} height={1120} alt="Возможности Красотуля-CRM" loading="lazy" className="h-auto w-full rounded-2xl" />
    </div>
  </Section>;
}
