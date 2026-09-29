import React from "react";
import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleHelp,
  FileText,
  Files,
  Images,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  Wrench,
} from "lucide-react";
import { Form, NavLink, Outlet, useLoaderData, useLocation } from "react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "../../components/ui/sidebar";

export { headers, loader } from "./layout.server";

type AdminLayoutData = { login: string; csrfToken: string; expiresAt: string; sidebarOpen: boolean };

const navigation = [
  ["/admin/", "Обзор", LayoutDashboard],
  ["/admin/content/article/", "Статьи", FileText],
  ["/admin/content/case/", "Кейсы", BriefcaseBusiness],
  ["/admin/content/service/", "Услуги", Wrench],
  ["/admin/content/faq/", "FAQ", CircleHelp],
  ["/admin/content/page/", "Страницы", Files],
  ["/admin/media/", "Медиатека", Images],
  ["/admin/mcp/", "MCP-доступ", KeyRound],
  ["/admin/ads/", "Реклама", Megaphone],
  ["/admin/seo/", "SEO-мониторинг", ChartNoAxesCombined],
  ["/admin/settings/", "Настройки", Settings],
] as const;

export default function AdminLayout() {
  const data = useLoaderData<AdminLayoutData>();
  const location = useLocation();
  return (
    <SidebarProvider defaultOpen={data.sidebarOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex min-w-0 items-center gap-2 px-2 py-1">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">K</span>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate font-semibold">KorDevTeam</p>
              <p className="truncate text-xs text-muted-foreground">{data.login}</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label="Админка">
                <SidebarMenu>
                  {navigation.map(([to, label, Icon]) => {
                    const isActive = to === "/admin/" ? location.pathname === to : location.pathname.startsWith(to);
                    return <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                        <NavLink to={to} end={to === "/admin/"} title={label}>
                          <Icon aria-hidden />
                          <span>{label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>;
                  })}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <Form method="post" action="/admin/logout/">
            <input type="hidden" name="_csrf" value={data.csrfToken} />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Выйти">
                  <button type="submit" title="Выйти">
                    <LogOut aria-hidden />
                    <span>Выйти</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </Form>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur">
          <SidebarTrigger aria-label="Свернуть или открыть меню" title="Свернуть или открыть меню" className="size-9" />
          <p className="text-sm font-medium">Административная панель</p>
        </header>
        <div data-admin-content="true" className="min-w-0 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
