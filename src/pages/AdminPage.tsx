import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [activeTab, setActiveTab] = useState<"blog" | "krasotulya" | "projects" | "service">("blog");
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
  const [uploadingBlogImage, setUploadingBlogImage] = useState(false);
  const blogTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blogImageInputRef = useRef<HTMLInputElement | null>(null);

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

  const refreshAll = useCallback(async () => {
    await Promise.all([loadIndexes(), loadProjects()]);
    toast.success("Данные обновлены");
  }, [loadIndexes, loadProjects]);

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

  const insertIntoBlog = useCallback((snippet: string) => {
    const el = blogTextareaRef.current;
    if (!el) {
      setBlogContent((prev) => prev + snippet);
      return;
    }
    const start = typeof el.selectionStart === "number" ? el.selectionStart : 0;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    setBlogContent((prev) => prev.slice(0, start) + snippet + prev.slice(end));
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + snippet.length;
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore
      }
    });
  }, []);

  const uploadBlogImage = useCallback(
    async (file: File) => {
      try {
        if (!(await verifyAuth())) {
          toast.error("Нужна авторизация");
          return;
        }
        if (!file.type?.startsWith("image/")) {
          toast.error("Можно загрузить только изображение");
          return;
        }

        setUploadingBlogImage(true);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
          reader.readAsDataURL(file);
        });

        const resp = await fetchJson<{ url: string }>(`/api/admin/upload-blog-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(authHeaderValue) },
          body: JSON.stringify({ dataUrl, filename: file.name }),
        });

        insertIntoBlog(`\n\n![](${resp.url})\n`);
        toast.success("Фото загружено");
      } catch (e: any) {
        console.warn(e);
        toast.error(`Ошибка загрузки: ${e?.message || "unknown"}`);
      } finally {
        setUploadingBlogImage(false);
        if (blogImageInputRef.current) blogImageInputRef.current.value = "";
      }
    },
    [authHeaderValue, insertIntoBlog, verifyAuth],
  );

  useEffect(() => {
    loadIndexes();
    loadProjects();
  }, [loadIndexes, loadProjects]);

  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  const onSelectBlog = useCallback(
    async (slug: string) => {
      setBlogSelectedSlug(slug);
      setBlogSlugOverride(slug);
      const meta = blogIndex.find((x) => x.slug === slug) || null;
      setBlogTitle(meta?.title || slug);
      try {
        const data = await fetchJson<{ post: { content: string } }>(`/api/posts/${slug}?lang=${lang}`);
        setBlogContent(data.post.content || "");
      } catch (e) {
        console.warn(e);
        toast.error("Не удалось загрузить markdown поста");
      }
    },
    [blogIndex, lang]
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold">Админка</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex gap-2 items-center">
              <Button size="sm" variant={lang === "ru" ? "default" : "outline"} onClick={() => setLang("ru")}>
                RU
              </Button>
              <Button size="sm" variant={lang === "en" ? "default" : "outline"} onClick={() => setLang("en")}>
                EN
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={logout}>
              Выйти
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="blog">Блог</TabsTrigger>
            <TabsTrigger value="krasotulya">Красотуля</TabsTrigger>
            <TabsTrigger value="projects">Проекты</TabsTrigger>
            <TabsTrigger value="service">Сервис</TabsTrigger>
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
                    <Input placeholder="Заголовок" value={blogTitle} onChange={(e) => setBlogTitle(e.target.value)} />
                    <Input
                      placeholder="Slug (опционально)"
                      value={blogSlugOverride}
                      onChange={(e) => setBlogSlugOverride(e.target.value)}
                      disabled={Boolean(blogSelectedSlug)}
                    />
                  </div>
                  <Textarea
                    ref={blogTextareaRef}
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
                    <input
                      ref={blogImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadBlogImage(f);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingBlogImage}
                      onClick={() => blogImageInputRef.current?.click()}
                    >
                      {uploadingBlogImage ? "Загрузка..." : "Загрузить фото"}
                    </Button>
                    {blogSelectedSlug && (
                      <Button asChild variant="outline">
                        <a href={`/blog/${blogSelectedSlug}`} target="_blank" rel="noreferrer">
                          Открыть
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="pt-4 border-t border-border">
                    <div className="text-sm font-medium mb-2">Предпросмотр</div>
                    <div className="prose dark:prose-invert max-w-none bg-secondary/20 rounded-lg p-4">
                      <ReactMarkdown>{blogContent}</ReactMarkdown>
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
                    placeholder="Slug"
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
                  </div>

                  <div className="pt-4 border-t border-border">
                    <div className="text-sm font-medium mb-2">Предпросмотр</div>
                    <div className="prose dark:prose-invert max-w-none bg-secondary/20 rounded-lg p-4">
                      <ReactMarkdown>{crmContent}</ReactMarkdown>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="projects" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Проекты</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={loadProjects}>
                    Обновить
                  </Button>
                  <Button onClick={saveProjects}>Сохранить</Button>
                </div>
                <Textarea
                  value={projectsJson}
                  onChange={(e) => setProjectsJson(e.target.value)}
                  className="min-h-[520px] font-mono"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="service" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Сервис</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={refreshAll} disabled={loadingIndex}>
                  Обновить данные
                </Button>
                <Button variant="outline" onClick={generateIndex}>
                  Обновить индексы
                </Button>
                <Button variant="outline" onClick={generateStatic}>
                  Пересобрать статику
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

