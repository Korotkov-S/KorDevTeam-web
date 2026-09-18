import React from "react";
import { Link } from "react-router-dom";
import { Section } from "../public/Section";

export function ProofStrip() {
  return <Section id="proof" className="border-y border-border !py-8">
    <div className="grid gap-6 md:grid-cols-3">
      <h2 className="text-xl font-semibold tracking-tight">Опыт, который можно посмотреть</h2>
      <p className="text-sm leading-6 text-[var(--public-subtle)]">Развиваем собственный продукт — <a href="https://krasotula.com" className="font-medium text-[var(--public-blue)] underline underline-offset-4">CRM для малого бизнеса</a>.</p>
      <p className="text-sm leading-6 text-[var(--public-subtle)]">Показываем задачи и решения в <Link to="/cases/" className="font-medium text-[var(--public-blue)] underline underline-offset-4">портфолио проектов</Link>.</p>
    </div>
  </Section>;
}
