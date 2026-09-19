import React from "react";
import { LeadForm } from "../LeadForm";
import { track } from "../../lib/analytics";
import { Section } from "./Section";

export type LeadCtaSectionProps = { pagePath: string; title?: string; description?: string };

const PORTRAIT = "/team/gennady-korotkov.jpg";

export function LeadCtaSection({
  pagePath,
  title = "Расскажите о вашей задаче",
  description = "Обсудим, что нужно вашему бизнесу, и предложим следующий шаг.",
}: LeadCtaSectionProps) {
  return (
    <Section id="contact" className="border-t border-border py-12 lg:py-20">
      <div className="overflow-hidden rounded-[2rem] bg-[#e9edf5] text-[#0b1020] dark:bg-[#151b2a] dark:text-white sm:rounded-[3rem]">
        <div className="grid lg:grid-cols-[minmax(0,1.65fr)_minmax(19rem,.75fr)]">
          <div className="px-5 py-10 sm:px-9 sm:py-14 lg:px-14 lg:py-16">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#6541d8] dark:text-[#b7a7ff]">
              Начнём с разговора
            </p>
            <h2 className="mt-5 max-w-4xl text-balance text-4xl font-semibold leading-[.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              {title}
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#525c70] dark:text-[#b8c0cf] sm:text-xl">
              {description}
            </p>

            <div className="mt-10">
              <LeadForm pagePath={pagePath} className="lead-form-editorial" />
            </div>
          </div>

          <aside className="order-first flex min-h-full flex-col bg-[#dfe5ee] px-5 py-7 dark:bg-[#20283a] sm:px-9 lg:order-none lg:px-10 lg:py-12" aria-label="Ваш контакт в KorDevTeam">
            <div className="grid grid-cols-[6.5rem_1fr] items-center gap-x-5 lg:block">
              <img
                src={PORTRAIT}
                alt="Геннадий Коротков"
                width="320"
                height="320"
                loading="lazy"
                className="aspect-square w-24 rounded-full object-cover ring-4 ring-white/45 dark:ring-white/10 lg:w-full lg:rounded-[2rem] lg:ring-8"
              />
              <div className="lg:mt-8">
                <p className="text-2xl font-semibold leading-none tracking-[-0.04em] lg:text-3xl">Геннадий Коротков</p>
                <p className="mt-2 text-base text-[#687286] dark:text-[#aab4c5] lg:mt-3 lg:text-lg">Руководитель KorDevTeam</p>
                <p className="mt-6 hidden text-lg leading-7 text-[#313a4b] dark:text-[#d4dae5] lg:block">
                  Лично посмотрю задачу и отвечу, с чего разумнее начать.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-start gap-x-5 gap-y-2 text-sm font-medium lg:mt-auto lg:flex-col lg:gap-3 lg:pt-10 lg:text-lg">
              <a href="https://telegram.me/ideamen51" aria-label="Telegram" className="border-b border-current" onClick={() => track("telegram_click", { path: pagePath })}>
                Написать в Telegram ↗
              </a>
              <a href="mailto:team@korotkov.dev" className="border-b border-current" onClick={() => track("email_click", { path: pagePath })}>
                team@korotkov.dev
              </a>
              <a
                href="https://max.ru/u/f9LHodD0cOJpymJqsmOnWwFeDCCZGy15ba7H_HhajC8Vnm6U12_ZrsEX8uY"
                aria-label="Геннадий Коротков"
                target="_blank"
                rel="noopener noreferrer"
                className="border-b border-current"
              >
                Max: Геннадий Коротков
              </a>
            </div>
          </aside>
        </div>
      </div>
    </Section>
  );
}
