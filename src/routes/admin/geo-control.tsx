import React from "react";
import type { summarizeGeoControl } from "../../server/geo-monitoring/control";
import { Empty, GeoPanel, GeoTable, platformLabels } from "./geo-shared";

export type GeoControlData = ReturnType<typeof summarizeGeoControl>;
type Rate = { numerator: number; denominator: number; value: number | null };
const rate = (value: Rate) => value.denominator ? `${value.numerator} / ${value.denominator}` : "Нет данных";

export function GeoControl({ control }: { control?: GeoControlData }) {
  if (!control) return <Empty>Контроль сопоставимости ещё недоступен.</Empty>;
  return <div className="space-y-6">
    <GeoPanel title="Брендовые и небрендовые вопросы" help="Последняя полная тройка на вопрос. Проверенный ноль отличается от отсутствия данных; охват может объединять разные условия и не доказывает рост.">
      <GeoTable minWidth="850px"><thead><tr>{["Платформа", "Вопросы", "Проверено / каталог", "Не проверено", "Упоминания / ответы", "Цитирования / ответы"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody>{control.coverage.map(row => <tr key={`${row.platform}-${row.category}`} className="border-t border-border">
          <td className="p-3">{platformLabels[row.platform] ?? row.platform}</td><td className="p-3">{row.category === "brand" ? "Брендовые" : "Небрендовые"}</td>
          <td className="p-3">{row.checkedQuestions} / {row.plannedQuestions}</td><td className="p-3">{row.uncheckedQuestions}</td>
          <td className="p-3">{rate(row.mentionRate)}</td><td className="p-3">{rate(row.citationRate)}</td>
        </tr>)}</tbody></GeoTable>
      <p className="mt-3 text-sm text-muted-foreground">Это описательный охват, не динамика позиций и не сравнение разных платформ.</p>
    </GeoPanel>
    <GeoPanel title="Сопоставимые наборы" help="Для обоснованной гипотезы нужны три полных сопоставимых снимка: одинаковые вопросы, определения, платформа, поверхность, режим, язык, регион и персонализация.">
      {control.cohorts.length ? <GeoTable minWidth="1100px"><thead><tr>{["Условия", "Персонализация", "Вопросы", "Полные снимки", "Упоминания", "Цитирования", "Достаточность"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody>{control.cohorts.map((cohort, index) => <tr key={index} className="border-t border-border">
          <td className="p-3">{platformLabels[cohort.platform] ?? cohort.platform} · {cohort.surface} · {cohort.mode} · {cohort.language} · {cohort.region}</td>
          <td className="p-3">{cohort.sessionPersonalized ? "Персонализировано" : "Неперсонализировано"}</td>
          <td className="p-3"><details><summary>{cohort.promptIds.length}</summary><p className="max-w-64 break-all">{cohort.promptIds.join(", ")}</p><p className="max-w-64 break-all">Запуски: {cohort.runIds.join(", ")}</p></details></td>
          <td className="p-3">{cohort.completeSnapshots} / 3</td><td className="p-3">{rate(cohort.metrics.mentionRate)}</td><td className="p-3">{rate(cohort.metrics.citationRate)}</td>
          <td className="p-3">{cohort.decisionReady ? "Готово к гипотезе" : "Недостаточно снимков"}</td>
        </tr>)}</tbody></GeoTable> : <Empty>Полных пригодных снимков за период нет. Это не нулевая видимость.</Empty>}
    </GeoPanel>
  </div>;
}
