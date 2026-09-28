import React from "react";
import { NavLink, Outlet } from "react-router";

export const ADS_SECTIONS = [
  ["/admin/ads/", "Сводка"],
  ["/admin/ads/hypotheses/", "Гипотезы"],
  ["/admin/ads/experiments/", "Эксперименты"],
  ["/admin/ads/radar/", "Радар практик"],
  ["/admin/ads/learnings/", "Выводы"],
  ["/admin/ads/economics/", "Экономика"],
  ["/admin/ads/events/", "Журнал"],
] as const;

export function AdsSectionLayout() {
  return <div className="mx-auto max-w-[1600px] space-y-6">
    <nav aria-label="Разделы рекламы" className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2">
      {ADS_SECTIONS.map(([to, label]) => <NavLink key={to} to={to} end={to === "/admin/ads/"} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</NavLink>)}
    </nav>
    <Outlet />
  </div>;
}

export default AdsSectionLayout;
