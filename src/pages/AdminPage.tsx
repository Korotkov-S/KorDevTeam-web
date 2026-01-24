import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";

type Lang = "ru" | "en";

type ContentMeta = {
  slug: string;
  lang: Lang;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  mtimeMs?: number;
};

function langSuffix(lang: Lang) {
  return lang === "en" ? ".en" : "";
}

function authHeaders(authHeaderValue: string) {
  return authHeaderValue ? { Authorization: authHeaderValue } : {};
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function checkAuth(header: string): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetch(`/api/admin/me`, { headers: { ...authHeaders(header) } });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

export function AdminPage() {
  const [username, setUsername] = useState<string>(() => localStorage.getItem("ADMIN_USERNAME") || "");
  const [password, setPassword] = useState<string>(() => localStorage.getItem("ADMIN_PASSWORD") || "");
  const [authHeaderValue, setAuthHeaderValue] = useState<string>(() => localStorage.getItem("ADMIN_AUTH") || "");
  const [isAuthed, setIsAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<"blog" | "krasotulya" | "projects">("blog");
  const [lang, setLang] = useState<Lang>("ru");

  // Indexes
  const [blogIndex, setBlogIndex] = useState<ContentMeta[]>([]);
  const [crmIndex, setCrmIndex] = useState<ContentMeta[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(false);

  // Blog editor
  const [blogSelectedSlug, setBlogSelectedSlug] = useState<string>("");
  const [blogTitle, setBlogTitle] = useState<string>("");
  const [blogSlugOverride, setBlogSlugOverride] = useState<string>("");
  const [blogContent, setBlogContent] = useState<string>("");

  // CRM editor
  const [crmSelectedSlug, setCrmSelectedSlug] = useState<string>("");
  const [crmSlug, setCrmSlug] = useState<string>("");
  const [crmContent, setCrmContent] = useState<string>("");

  // Projects editor (raw JSON)
  const [projectsJson, setProjectsJson] = useState<string>("[]\n");

  const loadIndexes = useCallback(async () => {
    setLoadingIndex(true);
    try {
      const [blog, crm] = await Promise.all([
        fetchJson<{ items: ContentMeta[] }>(`/api/content/blog?lang=${lang}`),
        fetchJson<{ items: ContentMeta[] }>(`/api/content/krasotulya-crm?lang=${lang}`),
      ]);
      setBlogIndex(blog.items || []);
      setCrmIndex(crm.items || []);
    } catch (e) {
      console.warn(e);
      toast.error("Не удалось загрузить индексы контента. Проверь, что API сервер запущен.");
    } finally {
      setLoadingIndex(false);
    }
  }, [lang]);

  const loadProjects = useCallback(async () => {
    try {
      const raw = await fetchText(`/content/projects.${lang}.json`);
      setProjectsJson(raw.endsWith("\n") ? raw : raw + "\n");
      return;
    } catch {
      // ignore, fallback to api
    }
    try {
      const data = await fetchJson<{ projects: unknown }>(`/api/projects?lang=${lang}`);
      setProjectsJson(JSON.stringify(data.projects ?? [], null, 2) + "\n");
    } catch (e) {
      console.warn(e);
      setProjectsJson("[]\n");
      toast.error("Не удалось загрузить projects. Создай новый список и сохрани.");
    }
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("ADMIN_USERNAME", username);
  }, [username]);

  useEffect(() => {
    localStorage.setItem("ADMIN_PASSWORD", password);
  }, [password]);

  useEffect(() => {
    localStorage.setItem("ADMIN_AUTH", authHeaderValue);
  }, [authHeaderValue]);

  const verifyAuth = useCallback(async () => {
    if (!authHeaderValue) {
      setIsAuthed(false);
      return false;
    }
    const r = await checkAuth(authHeaderValue);
    if (r.ok) {
      setIsAuthed(true);
      return true;
    }
    // If API is unreachable, don't force logout; keep current state.
    if (r.status === null) return false;
    setIsAuthed(false);
    return false;
  }, [authHeaderValue]);

  useEffect(() => {
    loadIndexes();
    loadProjects();
  }, [loadIndexes, loadProjects]);

  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  const selectedBlogMeta = useMemo(
    () => blogIndex.find((x) => x.slug === blogSelectedSlug) || null,
    [blogIndex, blogSelectedSlug]
  );
  const selectedCrmMeta = useMemo(
    () => crmIndex.find((x) => x.slug === crmSelectedSlug) || null,
    [crmIndex, crmSelectedSlug]
  );

  const onSelectBlog = useCallback(
    async (slug: string) => {
      setBlogSelectedSlug(slug);
      setBlogSlugOverride(slug);
      setBlogTitle(selectedBlogMeta?.title || slug);
      try {
        const data = await fetchJson<{ post: { content: string } }>(`/api/posts/${slug}?lang=${lang}`);
        setBlogContent(data.post.content || "");
      } catch (e) {
        console.warn(e);
        toast.error("Не удалось загрузить markdown поста");
      }
    },
    [lang, selectedBlogMeta]
  );

  const onSelectCrm = useCallback(
    async (slug: string) => {
      setCrmSelectedSlug(slug);
      setCrmSlug(slug);
      try {
        const data = await fetchJson<{ content: string }>(`/api/krasotulya-crm/${slug}?lang=${lang}`);
        setCrmContent(data.content || "");
      } catch (e) {
        console.warn(e);
        toast.error("Не удалось загрузить markdown страницы Красотули");
      }
    },
    [lang]
  );

  const saveBlog = useCallback(async () => {
    try {
      if (!(await verifyAuth())) {
        toast.error("Нужна авторизация");
        return;
      }
      if (!blogTitle.trim() || !blogContent.trim()) {
        toast.error("Нужны title и content");
        return;
      }
      const isUpdate = Boolean(blogSelectedSlug);
      if (isUpdate) {
        await fetchJson(`/api/posts/${blogSelectedSlug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders(authHeaderValue) },
          body: JSON.stringify({ title: blogTitle, content: blogContent, lang }),
        });
        toast.success("Сохранено");
      } else {
        const resp = await fetchJson<{ post: { slug: string } }>(`/api/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(authHeaderValue) },
          body: JSON.stringify({
            title: blogTitle,
            slug: blogSlugOverride || undefined,
            content: blogContent,
            lang,
          }),
        });
        toast.success(`Создано: ${resp.post.slug}`);
        setBlogSelectedSlug(resp.post.slug);
      }
      await loadIndexes();
    } catch (e: any) {
      console.warn(e);
      toast.error(`Ошибка сохранения: ${e?.message || "unknown"}`);
    }
  }, [authHeaderValue, blogContent, blogSelectedSlug, blogSlugOverride, blogTitle, lang, loadIndexes, verifyAuth]);

  const deleteBlog = useCallback(async () => {
    if (!blogSelectedSlug) return;
    try {
      if (!(await verifyAuth())) {
        toast.error("Нужна авторизация");
        return;
      }
      await fetchJson(`/api/posts/${blogSelectedSlug}?lang=${lang}`, {
        method: "DELETE",
        headers: { ...authHeaders(authHeaderValue) },
      });
      toast.success("Удалено");
      setBlogSelectedSlug("");
      setBlogTitle("");
      setBlogSlugOverride("");
      setBlogContent("");
      await loadIndexes();
    } catch (e: any) {
      console.warn(e);
      toast.error(`Ошибка удаления: ${e?.message || "unknown"}`);
    }
  }, [authHeaderValue, blogSelectedSlug, lang, loadIndexes, verifyAuth]);

  const saveCrm = useCallback(async () => {
    try {
      if (!(await verifyAuth())) {
        toast.error("Нужна авторизация");
        return;
      }
      if (!crmSlug.trim() || !crmContent.trim()) {
        toast.error("Нужны slug и content");
        return;
      }
      const isUpdate = Boolean(crmSelectedSlug);
      if (isUpdate) {
        await fetchJson(`/api/krasotulya-crm/${crmSelectedSlug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders(authHeaderValue) },
          body: JSON.stringify({ content: crmContent, lang }),
        });
      } else {
        await fetchJson(`/api/krasotulya-crm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(authHeaderValue) },
          body: JSON.stringify({ slug: crmSlug, content: crmContent, lang }),
        });
        setCrmSelectedSlug(crmSlug);
      }
      toast.success("Сохранено");
      await loadIndexes();
    } catch (e: any) {
      console.warn(e);
      toast.error(`Ошибка сохранения: ${e?.message || "unknown"}`);
    }
  }, [authHeaderValue, crmContent, crmSelectedSlug, crmSlug, lang, loadIndexes, verifyAuth]);

  const deleteCrm = useCallback(async () => {
    if (!crmSelectedSlug) return;
    try {
      if (!(await verifyAuth())) {
        toast.error("Нужна авторизация");
        return;
      }
      await fetchJson(`/api/krasotulya-crm/${crmSelectedSlug}?lang=${lang}`, {
        method: "DELETE",
        headers: { ...authHeaders(authHeaderValue) },
      });
      toast.success("Удалено");
      setCrmSelectedSlug("");
      setCrmSlug("");
      setCrmContent("");
      await loadIndexes();
    } catch (e: any) {
      console.warn(e);
      toast.error(`Ошибка удаления: ${e?.message || "unknown"}`);
    }
  }, [authHeaderValue, crmSelectedSlug, lang, loadIndexes, verifyAuth]);

  const saveProjects = useCallback(async () => {
    try {
      if (!(await verifyAuth())) {
        toast.error("Нужна авторизация");
        return;
      }
      const parsed = JSON.parse(projectsJson);
      if (!Array.isArray(parsed)) {
        toast.error("projects должен быть массивом");
        return;
      }
      await fetchJson(`/api/projects?lang=${lang}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders(authHeaderValue) },
        body: JSON.stringify({ projects: parsed }),
      });
      toast.success("Projects сохранены");
    } catch (e: any) {
      console.warn(e);
      toast.error(`Ошибка projects: ${e?.message || "unknown"}`);
    }
  }, [authHeaderValue, lang, projectsJson, verifyAuth]);

  const generateStatic = useCallback(async () => {
    try {
      if (!(await verifyAuth())) {
        toast.error("Нужна авторизация");
        return;
      }
      await fetchJson(`/api/admin/generate`, {
        method: "POST",
        headers: { ...authHeaders(authHeaderValue) },
      });
      toast.success("Генерация запущена/завершена");
    } catch (e: any) {
      console.warn(e);
      toast.error(`Ошибка генерации: ${e?.message || "unknown"}`);
    }
  }, [authHeaderValue, verifyAuth]);

  const generateIndex = useCallback(async () => {
    try {
      if (!(await verifyAuth())) {
        toast.error("Нужна авторизация");
        return;
      }
      await fetchJson(`/api/admin/generate-index`, {
        method: "POST",
        headers: { ...authHeaders(authHeaderValue) },
      });
      toast.success("Индексы обновлены");
      await loadIndexes();
    } catch (e: any) {
      console.warn(e);
      toast.error(`Ошибка индексов: ${e?.message || "unknown"}`);
    }
  }, [authHeaderValue, loadIndexes, verifyAuth]);

  const login = useCallback(async () => {
    try {
      const u = username.trim();
      const p = password.trim();
      if (!u || !p) {
        toast.error("Заполни логин и пароль");
        return;
      }

      // Local gate (so login UI works even when API isn't running)
      if (u !== "adminKor" || p !== "adminKor") {
        toast.error("Неверный логин/пароль");
        setIsAuthed(false);
        return;
      }

      const header = `Basic ${btoa(`${u}:${p}`)}`;
      setAuthHeaderValue(header);
      setIsAuthed(true);
      const r = await checkAuth(header);
      if (!r.ok) {
        if (r.status === null) toast("Вход выполнен, но API сервер недоступен — сохранение/генерация не будут работать.");
        else toast("Вход выполнен, но API отклонил запрос. Проверь, что сервер обновлён и запущен.");
      } else {
        toast.success("Вход выполнен");
      }
    } catch (e: any) {
      console.warn(e);
      toast.error(e?.message || "Ошибка входа");
    }
  }, [password, username]);

  const logout = useCallback(() => {
    setIsAuthed(false);
    setAuthHeaderValue("");
    localStorage.removeItem("ADMIN_AUTH");
    toast.success("Выход");
  }, []);

  if (!isAuthed) {
    return (
      <div className="min-h-screen pt-24">
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Вход в админку</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <Input
                  placeholder="Логин"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <Input
                  placeholder="Пароль"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button className="w-full mt-1" onClick={login}>
                  Войти
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Admin</h1>
            <p className="text-muted-foreground">
              Управление markdown (blog / krasotulya-crm) и projects.json. API по умолчанию: `http://localhost:3001`.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex gap-2 items-center">
              <Button variant={lang === "ru" ? "default" : "outline"} onClick={() => setLang("ru")}>
                RU
              </Button>
              <Button variant={lang === "en" ? "default" : "outline"} onClick={() => setLang("en")}>
                EN
              </Button>
            </div>
            <Button variant="outline" onClick={logout}>
              Logout
            </Button>
            <Button variant="outline" onClick={loadIndexes} disabled={loadingIndex}>
              Обновить индекс
            </Button>
            <Button variant="outline" onClick={generateStatic}>
              Generate static
            </Button>
            <Button variant="outline" onClick={generateIndex}>
              Generate index
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="blog">Blog</TabsTrigger>
            <TabsTrigger value="krasotulya">Красотуля</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
          </TabsList>

          <TabsContent value="blog" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Посты</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => {
                      setBlogSelectedSlug("");
                      setBlogTitle("");
                      setBlogSlugOverride("");
                      setBlogContent("");
                    }}
                  >
                    + Новый пост
                  </Button>
                  <div className="max-h-[520px] overflow-auto space-y-2">
                    {blogIndex.map((p) => (
                      <button
                        key={p.slug}
                        className={`w-full text-left rounded-md border px-3 py-2 hover:border-primary/60 ${
                          p.slug === blogSelectedSlug ? "border-primary" : "border-border"
                        }`}
                        onClick={() => onSelectBlog(p.slug)}
                      >
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-muted-foreground">{p.slug}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.tags.slice(0, 4).map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Редактор</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input placeholder="Title (для создания)" value={blogTitle} onChange={(e) => setBlogTitle(e.target.value)} />
                    <Input
                      placeholder="Slug override (optional)"
                      value={blogSlugOverride}
                      onChange={(e) => setBlogSlugOverride(e.target.value)}
                      disabled={Boolean(blogSelectedSlug)}
                    />
                  </div>
                  <Textarea
                    value={blogContent}
                    onChange={(e) => setBlogContent(e.target.value)}
                    className="min-h-[320px] font-mono"
                    placeholder={"# Title\n\nText...\n\n---\n\n**Теги**: ...\n**Дата публикации**: ...\n"}
                  />

                  <div className="flex gap-2">
                    <Button onClick={saveBlog}>Сохранить</Button>
                    <Button variant="destructive" onClick={deleteBlog} disabled={!blogSelectedSlug}>
                      Удалить
                    </Button>
                    {blogSelectedSlug && (
                      <Button asChild variant="outline">
                        <a href={`/blog/${blogSelectedSlug}`} target="_blank" rel="noreferrer">
                          Открыть
                        </a>
                      </Button>
                    )}
                    {blogSelectedSlug && (
                      <Button asChild variant="outline">
                        <a
                          href={`/blog/${blogSelectedSlug}${langSuffix(lang)}.md`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          MD
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                    <div>
                      <div className="text-sm font-medium mb-2">Preview</div>
                      <div className="prose prose-invert max-w-none bg-secondary/20 rounded-lg p-4">
                        <ReactMarkdown>{blogContent}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div className="font-medium text-foreground mb-2">Подсказка</div>
                      <ul className="list-disc ml-5 space-y-1">
                        <li>Заголовок берётся из первой строки `# ...`.</li>
                        <li>Теги/дата можно писать внизу как в существующих статьях.</li>
                        <li>
                          Индекс на сайте будет строиться из файлов в `public/blog` через `/api/content/blog`.
                        </li>
                      </ul>
                      {selectedBlogMeta && (
                        <div className="mt-4">
                          <div className="font-medium text-foreground mb-1">Текущая мета</div>
                          <div>Дата: {selectedBlogMeta.date || "—"}</div>
                          <div>Read time: {selectedBlogMeta.readTime || "—"}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="krasotulya" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Страницы</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => {
                      setCrmSelectedSlug("");
                      setCrmSlug("");
                      setCrmContent("");
                    }}
                  >
                    + Новая страница
                  </Button>
                  <div className="max-h-[520px] overflow-auto space-y-2">
                    {crmIndex.map((p) => (
                      <button
                        key={p.slug}
                        className={`w-full text-left rounded-md border px-3 py-2 hover:border-primary/60 ${
                          p.slug === crmSelectedSlug ? "border-primary" : "border-border"
                        }`}
                        onClick={() => onSelectCrm(p.slug)}
                      >
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-muted-foreground">{p.slug}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Редактор</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Slug (required for create)"
                    value={crmSlug}
                    onChange={(e) => setCrmSlug(e.target.value)}
                    disabled={Boolean(crmSelectedSlug)}
                  />
                  <Textarea
                    value={crmContent}
                    onChange={(e) => setCrmContent(e.target.value)}
                    className="min-h-[320px] font-mono"
                    placeholder={"# Заголовок\n\nТекст...\n\n---\n\n**Теги**: ...\n**Дата публикации**: ...\n"}
                  />
                  <div className="flex gap-2">
                    <Button onClick={saveCrm}>Сохранить</Button>
                    <Button variant="destructive" onClick={deleteCrm} disabled={!crmSelectedSlug}>
                      Удалить
                    </Button>
                    {crmSelectedSlug && (
                      <Button asChild variant="outline">
                        <a href={`/krasotulya-crm/${crmSelectedSlug}`} target="_blank" rel="noreferrer">
                          Открыть
                        </a>
                      </Button>
                    )}
                    {crmSelectedSlug && (
                      <Button asChild variant="outline">
                        <a
                          href={`/krasotulya-crm/${crmSelectedSlug}${langSuffix(lang)}.md`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          MD
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                    <div>
                      <div className="text-sm font-medium mb-2">Preview</div>
                      <div className="prose prose-invert max-w-none bg-secondary/20 rounded-lg p-4">
                        <ReactMarkdown>{crmContent}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div className="font-medium text-foreground mb-2">Подсказка</div>
                      <ul className="list-disc ml-5 space-y-1">
                        <li>Slug обязателен (используется в URL).</li>
                        <li>Мета (title/excerpt/tags/date) берётся из markdown.</li>
                        <li>Индекс на сайте будет строиться из `public/krasotulya-crm` через `/api/content/krasotulya-crm`.</li>
                      </ul>
                      {selectedCrmMeta && (
                        <div className="mt-4">
                          <div className="font-medium text-foreground mb-1">Текущая мета</div>
                          <div>Дата: {selectedCrmMeta.date || "—"}</div>
                          <div>Read time: {selectedCrmMeta.readTime || "—"}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="projects" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Projects JSON</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={loadProjects}>
                    Reload
                  </Button>
                  <Button onClick={saveProjects}>Save</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setProjectsJson(
                        JSON.stringify(
                          [
                            {
                              id: "new-project",
                              title: "New project",
                              description: "Short description",
                              fullDescription: "## Details\n\nWrite markdown here.",
                              image: "/projects/your.png",
                              technologies: ["React"],
                              features: ["Feature 1"],
                              demoUrl: "https://example.com",
                              githubUrl: "#",
                            },
                          ],
                          null,
                          2
                        ) + "\n"
                      );
                    }}
                  >
                    Template
                  </Button>
                </div>
                <Textarea
                  value={projectsJson}
                  onChange={(e) => setProjectsJson(e.target.value)}
                  className="min-h-[520px] font-mono"
                />
                <div className="text-sm text-muted-foreground">
                  Файл сохраняется в `public/content/projects.{lang}.json` (и в dist, если задан `CONTENT_DIST_ROOT`).
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

