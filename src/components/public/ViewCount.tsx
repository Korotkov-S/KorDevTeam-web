import React from "react";
import { Eye } from "lucide-react";
export function ViewCount({ value, className = "" }: { value: string | null; className?: string }) {
  const count = value !== null && /^\d+$/.test(value) ? BigInt(value) : null;
  const formatted = count === null ? "—" : new Intl.NumberFormat("ru-RU").format(count);
  const suffix = count === null ? "" : count % 100n >= 11n && count % 100n <= 14n ? "просмотров" : count % 10n === 1n ? "просмотр" : count % 10n >= 2n && count % 10n <= 4n ? "просмотра" : "просмотров";
  return <span className={`inline-flex items-center gap-1.5 tabular-nums ${className}`} aria-label={count === null ? "Просмотры недоступны" : `${formatted} ${suffix}`} data-view-count={value ?? "unavailable"}>
    <Eye className="size-4 shrink-0" aria-hidden="true" />{formatted}
  </span>;
}
