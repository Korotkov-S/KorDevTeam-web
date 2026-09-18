import React from "react";
import { Section, SectionHeading } from "../public/Section";

const steps = [
  ["Погружение", "Разбираем задачу, текущие процессы и ограничения. Фиксируем, что должно измениться."],
  ["Проектирование", "Согласуем сценарии, архитектуру, объём работ и критерии приёмки."],
  ["Разработка", "Делим работу на этапы, показываем промежуточный результат и обсуждаем обратную связь."],
  ["Запуск", "Проверяем рабочие сценарии, готовим систему к запуску и передаём документацию."],
  ["Поддержка", "Договариваемся о сопровождении и планируем развитие после запуска."],
];

export function ProcessSteps() {
  return <Section id="process">
    <SectionHeading eyebrow="Как работаем" title="Понятный путь от идеи до запуска" description="Объём, этапы и критерии готовности согласуем до начала работ. Изменения обсуждаем вместе." />
    <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map(([title, description], index) => <li key={title} className="border-t border-[var(--public-subtle)] pt-5">
        <span className="text-sm font-semibold text-[var(--public-violet)]">0{index + 1}</span>
        <h3 className="mt-6 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-[var(--public-subtle)]">{description}</p>
      </li>)}
    </ol>
  </Section>;
}
