import { Link, useLoaderData } from "react-router";

export { headers, loader } from "./index.server";

type AdminIndexData = { login: string };

export default function AdminIndex() {
  const data = useLoaderData<AdminIndexData>();
  return (
    <section>
      <h1 className="text-3xl font-semibold">Обзор</h1>
      <p className="mt-2 text-muted-foreground">Вы вошли как {data.login}.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link to="/admin/content/article/?status=draft" className="rounded-xl border border-border bg-card p-5 hover:bg-muted">
          <h2 className="font-medium">Черновики статей</h2>
          <p className="mt-1 text-sm text-muted-foreground">Продолжить подготовку материалов</p>
        </Link>
        <Link to="/admin/media/" className="rounded-xl border border-border bg-card p-5 hover:bg-muted">
          <h2 className="font-medium">Медиатека</h2>
          <p className="mt-1 text-sm text-muted-foreground">Изображения и варианты</p>
        </Link>
        <Link to="/admin/seo/" className="rounded-xl border border-border bg-card p-5 hover:bg-muted">
          <h2 className="font-medium">SEO-мониторинг</h2>
          <p className="mt-1 text-sm text-muted-foreground">Состояние сборщиков, позиции, трафик и рекомендации</p>
        </Link>
      </div>
    </section>
  );
}
