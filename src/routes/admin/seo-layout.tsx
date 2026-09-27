import React from "react";
import { NavLink, Outlet } from "react-router";

const sections = [
  ["/admin/seo/", "Сводка"],
  ["/admin/seo/positions/", "Позиции"],
  ["/admin/seo/traffic/", "Трафик и запросы"],
  ["/admin/seo/pages/", "Страницы"],
  ["/admin/seo/semantics/", "Семантика"],
  ["/admin/seo/changes/", "Изменения"],
] as const;

export function SeoSectionLayout() {
  return <div className="mx-auto max-w-[1600px] space-y-6">
    <nav aria-label="Разделы SEO-мониторинга" className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2">
      {sections.map(([to, label]) => <NavLink key={to} to={to} end={to === "/admin/seo/"} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</NavLink>)}
    </nav>
    <Outlet />
  </div>;
}

export default SeoSectionLayout;
