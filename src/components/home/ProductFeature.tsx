import React from "react";
import { Section } from "../public/Section";
import { CtaLink } from "../public/CtaLink";

export function ProductFeature() {
  return <Section id="krasotula">
    <div className="grid overflow-hidden rounded-[2rem] bg-[#3437ee] text-white lg:grid-cols-12">
      <div className="flex flex-col p-7 sm:p-10 lg:col-span-5 lg:p-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">Собственный продукт</p>
        <h2 className="mt-5 text-balance text-5xl font-medium leading-[0.88] tracking-[-0.06em] sm:text-7xl">Krasotula CRM</h2>
        <p className="mt-7 max-w-xl text-lg leading-8 text-white/78">Клиенты, продажи, задачи и онлайн-запись в одной системе. Развиваем CRM сами и переносим продуктовый опыт в заказную разработку.</p>
        <ul className="my-8 grid grid-cols-2 gap-x-5 gap-y-3 text-sm text-white/78">
          {["Клиенты и сделки", "Задачи и воронки", "Онлайн-запись", "Чаты и рассылки"].map(feature => <li key={feature} className="border-t border-white/25 pt-3">{feature}</li>)}
        </ul>
        <div className="mt-auto flex flex-wrap gap-3 [&_a:first-child]:bg-white [&_a:first-child]:text-[#10131f] [&_a:last-child]:border-white [&_a:last-child]:text-white">
          <CtaLink to="https://krasotula.com">Посмотреть продукт ↗</CtaLink>
          <CtaLink to="/#contact" variant="secondary">Обсудить внедрение</CtaLink>
        </div>
      </div>
      <div className="flex items-end bg-[linear-gradient(135deg,#706cff_0%,#9187ff_100%)] p-5 pb-0 sm:p-8 sm:pb-0 lg:col-span-7 lg:pl-0 lg:pt-10">
        <img src="/products/krasotulya-crm-capabilities-hero.webp" srcSet="/products/krasotulya-crm-capabilities-hero-640.webp 640w, /products/krasotulya-crm-capabilities-hero-960.webp 960w, /products/krasotulya-crm-capabilities-hero.webp 1600w" sizes="(min-width: 1024px) 58vw, 100vw" width={1600} height={1120} alt="Возможности Красотуля-CRM" loading="lazy" className="h-auto w-full rounded-t-[1.4rem] shadow-[0_30px_80px_rgba(14,10,70,0.35)]" />
      </div>
    </div>
  </Section>;
}
