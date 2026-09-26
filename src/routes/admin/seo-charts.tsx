import React from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts@2.15.2";

import { ChartContainer, type ChartConfig } from "../../components/ui/chart";

type DailyPoint = { date: string; impressions: number; clicks: number; ctr: number | null; averagePosition: number | null };
type Change = { appliedAt: string };
type Breakdown = { key?: string; label?: string; bucket?: string; impressions?: number; clicks?: number; count?: number };

const trafficConfig = { impressions: { label: "Показы", color: "#2563eb" }, clicks: { label: "Клики", color: "#16a34a" } } satisfies ChartConfig;
const metricConfig = { value: { label: "Значение", color: "#7c3aed" } } satisfies ChartConfig;

export function formatSeoChartDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return value;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== value) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function markers(changes: readonly Change[]) {
  return changes.map((change) => <ReferenceLine key={change.appliedAt} x={change.appliedAt.slice(0, 10)} stroke="#f97316" strokeDasharray="4 4" />);
}

export function TrafficChart({ data, changes }: { data: DailyPoint[]; changes: Change[] }) {
  return <ChartContainer config={trafficConfig} className="h-72 w-full" data-chart-gaps="preserved">
    <LineChart data={data}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={formatSeoChartDate} /><YAxis /><Tooltip labelFormatter={formatSeoChartDate} /><Legend />
      <Line dataKey="impressions" name="Показы" stroke="var(--color-impressions)" connectNulls={false} dot={false} />
      <Line dataKey="clicks" name="Клики" stroke="var(--color-clicks)" connectNulls={false} dot={false} />{markers(changes)}
    </LineChart>
  </ChartContainer>;
}

export function CtrChart({ data, changes }: { data: DailyPoint[]; changes: Change[] }) {
  const points = data.map((row) => ({ ...row, value: row.ctr === null ? null : row.ctr * 100 }));
  return <ChartContainer config={metricConfig} className="h-64 w-full" data-chart-gaps="preserved">
    <LineChart data={points}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={formatSeoChartDate} /><YAxis unit="%" /><Tooltip labelFormatter={formatSeoChartDate} />
      <Line dataKey="value" name="CTR" stroke="var(--color-value)" connectNulls={false} dot={false} />{markers(changes)}
    </LineChart>
  </ChartContainer>;
}

export function PositionChart({ data, changes }: { data: DailyPoint[]; changes: Change[] }) {
  const values = data.flatMap((row) => row.averagePosition === null ? [] : [row.averagePosition]);
  const maximum = Math.max(10, Math.ceil(Math.max(...values, 10)));
  return <ChartContainer config={metricConfig} className="h-64 w-full" data-position-domain="reversed" data-chart-gaps="preserved">
    <LineChart data={data}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={formatSeoChartDate} /><YAxis reversed domain={[1, maximum]} /><Tooltip labelFormatter={formatSeoChartDate} />
      <Line dataKey="averagePosition" name="Средняя позиция" stroke="var(--color-value)" connectNulls={false} dot={false} />{markers(changes)}
    </LineChart>
  </ChartContainer>;
}

export function BreakdownChart({ data, dataKey = "impressions" }: { data: Breakdown[]; dataKey?: "impressions" | "count" }) {
  return <ChartContainer config={metricConfig} className="h-64 w-full">
    <BarChart data={data}><CartesianGrid vertical={false} /><XAxis dataKey={(data[0]?.bucket ? "bucket" : "label")} /><YAxis allowDecimals={false} /><Tooltip />
      <Bar dataKey={dataKey} fill="var(--color-value)" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ChartContainer>;
}
