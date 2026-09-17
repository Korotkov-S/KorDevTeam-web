import { Form, NavLink, Outlet, useLoaderData } from "react-router";

export { headers, loader } from "./layout.server";

type AdminLayoutData = { login: string; csrfToken: string; expiresAt: string };

const navigation = [
  ["/admin/", "Обзор"],
  ["/admin/content/article/", "Статьи"],
  ["/admin/content/case/", "Кейсы"],
  ["/admin/content/service/", "Услуги"],
  ["/admin/content/faq/", "FAQ"],
  ["/admin/content/page/", "Страницы"],
  ["/admin/media/", "Медиатека"],
  ["/admin/settings/", "Настройки"],
] as const;

export default function AdminLayout() {
  const data = useLoaderData<AdminLayoutData>();
  const links = navigation.map(([to, label]) => (
    <NavLink key={to} to={to} end={to === "/admin/"}
      className={({ isActive }) => `block rounded-lg px-3 py-2 ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
      {label}
    </NavLink>
  ));
  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[250px_1fr]">
      <aside className="hidden border-r border-border bg-card p-4 md:block">
        <p className="mb-1 font-semibold">KorDevTeam</p>
        <p className="mb-6 text-sm text-muted-foreground">{data.login}</p>
        <nav aria-label="Админка" className="space-y-1">{links}</nav>
        <Form method="post" action="/admin/logout/" className="mt-6">
          <input type="hidden" name="_csrf" value={data.csrfToken} />
          <button className="text-sm underline" type="submit">Выйти</button>
        </Form>
      </aside>
      <div>
        <header className="border-b border-border bg-card p-3 md:hidden">
          <details>
            <summary className="cursor-pointer font-medium">Меню админки</summary>
            <nav aria-label="Админка" className="mt-3 space-y-1">{links}</nav>
          </details>
        </header>
        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
