import React from "react";
import { LeadForm } from "../LeadForm";
import { Section, SectionHeading } from "./Section";

export type LeadCtaSectionProps = { pagePath: string; title?: string; description?: string };

export function LeadCtaSection({ pagePath, title = "Расскажите о вашей задаче", description = "Обсудим, что нужно вашему бизнесу, и предложим следующий шаг." }: LeadCtaSectionProps) {
  return <Section id="contact" className="border-t border-border">
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div>
        <SectionHeading eyebrow="Начнём с разговора" title={title} description={description} />
        <div className="mt-8 flex flex-col items-start gap-4 text-lg font-medium text-[var(--public-blue)]">
          <a href="mailto:team@korotkov.dev" className="underline underline-offset-4">team@korotkov.dev</a>
          <a href="https://telegram.me/ideamen51" className="underline underline-offset-4">Telegram</a>
        </div>
      </div>
      <div className="rounded-[var(--public-radius-card)] border border-border bg-card p-6 sm:p-8"><LeadForm pagePath={pagePath} /></div>
    </div>
  </Section>;
}
