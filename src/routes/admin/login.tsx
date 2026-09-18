import { Form, useActionData, useLoaderData } from "react-router";

export { action, headers, loader } from "./login.server";

type LoginData = { loginCsrf: string; returnTo: string };
type LoginActionData = { error?: string; login?: string; returnTo?: string; loginCsrf?: string };

export default function AdminLogin() {
  const initial = useLoaderData<LoginData>();
  const result = useActionData<LoginActionData>();
  const loginCsrf = result?.loginCsrf ?? initial.loginCsrf;
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <p className="text-sm text-muted-foreground">KorDevTeam</p>
        <h1 className="mt-2 text-2xl font-semibold">Вход в админку</h1>
        {result?.error && <div role="alert" tabIndex={-1} className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">{result.error}</div>}
        <Form method="post" action="/admin/login/" className="mt-6 space-y-4">
          <input type="hidden" name="_loginCsrf" value={loginCsrf} />
          <input type="hidden" name="returnTo" value={result?.returnTo ?? initial.returnTo} />
          <label className="block text-sm font-medium" htmlFor="admin-login">Логин</label>
          <input id="admin-login" name="login" autoComplete="username" required defaultValue={result?.login ?? ""}
            className="w-full rounded-lg border border-input bg-background px-3 py-2" />
          <label className="block text-sm font-medium" htmlFor="admin-password">Пароль</label>
          <input id="admin-password" name="password" type="password" autoComplete="current-password" required
            className="w-full rounded-lg border border-input bg-background px-3 py-2" />
          <button type="submit" className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Войти</button>
        </Form>
      </div>
    </main>
  );
}
