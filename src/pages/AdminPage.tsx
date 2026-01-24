import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownContent } from "../components/MarkdownContent";
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

type Project = {
  id: string;
  title: string;
  description: string;
  fullDescription: string;
  image: string;
  technologies: string[];
  features: string[];
  demoUrl?: string;
  githubUrl?: string;
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
  const [activeTab, setActiveTab] = useState<"blog" | "projects" | "service">("blog");
  const [lang, setLang] = useState<Lang>("ru");

  // Indexes
  const [blogIndex, setBlogIndex] = useState<ContentMeta[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(false);

  // Blog editor
  const [blogSelectedSlug, setBlogSelectedSlug] = useState<string>("");
  const [blogTitle, setBlogTitle] = useState<string>("");
  const [blogSlugOverride, setBlogSlugOverride] = useState<string>("");
  const [blogContent, setBlogContent] = useState<string>("");
  const [uploadingBlogImage, setUploadingBlogImage] = useState(false);
  const blogTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blogImageInputRef = useRef<HTMLInputElement | null>(null);

  // Projects editor (raw JSON)
  const [projectsJson, setProjectsJson] = useState<string>("[]\n");
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [projectSelectedId, setProjectSelectedId] = useState<string>("");
  const [projectDraft, setProjectDraft] = useState<Project>({
    id: "",
    title: "",
    description: "",
    fullDescription: "",
    image: "",
    technologies: [],
    features: [],
    demoUrl: "",
    githubUrl: "",
  });
  const [uploadingProjectImage, setUploadingProjectImage] = useState(false);
  const projectImageInputRef = useRef<HTMLInputElement | null>(null);

  const loadIndexes = useCallback(async () => {
    setLoadingIndex(true);
    try {
      const blog = await fetchJson<{ items: ContentMeta[] }>(`/api/content/blog?lang=${lang}`);
      setBlogIndex(blog.items || []);
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
      try {
        const parsed = JSON.parse(raw);
        setProjectsList(
          Array.isArray(parsed)
            ? parsed.map((p: any) => ({
                id: String(p?.id || ""),
                title: String(p?.title || p?.id || ""),
                description: String(p?.description || ""),
                fullDescription: String(p?.fullDescription || ""),
                image: String(p?.image || ""),
                technologies: Array.isArray(p?.technologies) ? p.technologies.map((x: any) => String(x)) : [],
                features: Array.isArray(p?.features) ? p.features.map((x: any) => String(x)) : [],
                demoUrl: p?.demoUrl ? String(p.demoUrl) : "",
                githubUrl: p?.githubUrl ? String(p.githubUrl) : "",
              }))
            : [],
        );
      } catch {
        setProjectsList([]);
      }
      return;
    } catch {
      // ignore, fallback to api
    }
    try {
      const data = await fetchJson<{ projects: unknown }>(`/api/projects?lang=${lang}`);
      setProjectsJson(JSON.stringify(data.projects ?? [], null, 2) + "\n");
      const parsed = data.projects;
      setProjectsList(
        Array.isArray(parsed)
          ? (parsed as any[]).map((p: any) => ({
              id: String(p?.id || ""),
              title: String(p?.title || p?.id || ""),
              description: String(p?.description || ""),
              fullDescription: String(p?.fullDescription || ""),
              image: String(p?.image || ""),
              technologies: Array.isArray(p?.technologies) ? p.technologies.map((x: any) => String(x)) : [],
              features: Array.isArray(p?.features) ? p.features.map((x: any) => String(x)) : [],
              demoUrl: p?.demoUrl ? String(p.demoUrl) : "",
              githubUrl: p?.githubUrl ? String(p.githubUrl) : "",
            }))
          : [],
      );
    } catch (e) {
      console.warn(e);
      setProjectsJson("[]\n");
      setProjectsList([]);
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

  const wrapBlogSelection = useCallback((before: string, after: string, placeholder: string) => {
    const el = blogTextareaRef.current;
    if (!el) {
      insertIntoBlog(`${before}${placeholder}${after}`);
      return;
    }
    const start = typeof el.selectionStart === "number" ? el.selectionStart : 0;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    const selected = blogContent.slice(start, end);
    const inner = selected || placeholder;
    const snippet = `${before}${inner}${after}`;

    setBlogContent((prev) => prev.slice(0, start) + snippet + prev.slice(end));
    requestAnimationFrame(() => {
      try {
        el.focus();
        const innerStart = start + before.length;
        const innerEnd = innerStart + inner.length;
        el.setSelectionRange(innerStart, innerEnd);
      } catch {
        // ignore
      }
    });
  }, [blogContent, insertIntoBlog]);

  const prefixBlogLines = useCallback((prefix: string) => {
    const el = blogTextareaRef.current;
    if (!el) {
      insertIntoBlog(`\n${prefix}`);
      return;
    }
    const start = typeof el.selectionStart === "number" ? el.selectionStart : 0;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    const selected = blogContent.slice(start, end) || "Пункт";
    const lines = selected.split("\n").map((l) => (l.trim() ? `${prefix}${l}` : l));
    const snippet = lines.join("\n");
    setBlogContent((prev) => prev.slice(0, start) + snippet + prev.slice(end));
    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(start, start + snippet.length);
      } catch {
        // ignore
      }
    });
  }, [blogContent, insertIntoBlog]);

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

  const persistProjectsList = useCallback(
    async (next: Project[]) => {
      if (!(await verifyAuth())) {
        toast.error("Нужна авторизация");
        return;
      }
      await fetchJson(`/api/projects?lang=${lang}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders(authHeaderValue) },
        body: JSON.stringify({ projects: next }),
      });
      setProjectsList(next);
      setProjectsJson(JSON.stringify(next, null, 2) + "\n");
      toast.success("Projects сохранены");
    },
    [authHeaderValue, lang, verifyAuth],
  );

  const selectProject = useCallback(
    (id: string) => {
      setProjectSelectedId(id);
      const p = projectsList.find((x) => x.id === id) || null;
      if (!p) return;
      setProjectDraft({
        id: p.id || "",
        title: p.title || "",
        description: p.description || "",
        fullDescription: p.fullDescription || "",
        image: p.image || "",
        technologies: Array.isArray(p.technologies) ? p.technologies : [],
        features: Array.isArray(p.features) ? p.features : [],
        demoUrl: p.demoUrl || "",
        githubUrl: p.githubUrl || "",
      });
    },
    [projectsList],
  );

  const resetProjectDraft = useCallback(() => {
    setProjectSelectedId("");
    setProjectDraft({
      id: "",
      title: "",
      description: "",
      fullDescription: "",
      image: "",
      technologies: [],
      features: [],
      demoUrl: "",
      githubUrl: "",
    });
  }, []);

  const upsertProject = useCallback(async () => {
    const id = projectDraft.id.trim();
    if (!id) {
      toast.error("Нужен id проекта (он же используется в URL)");
      return;
    }
    const nextItem: Project = {
      id,
      title: projectDraft.title.trim() || id,
      description: projectDraft.description || "",
      fullDescription: projectDraft.fullDescription || "",
      image: projectDraft.image || "",
      technologies: Array.isArray(projectDraft.technologies) ? projectDraft.technologies : [],
      features: Array.isArray(projectDraft.features) ? projectDraft.features : [],
      demoUrl: (projectDraft.demoUrl || "").trim(),
      githubUrl: (projectDraft.githubUrl || "").trim(),
    };
    const existingIdx = projectsList.findIndex((p) => p.id === id);
    const isEditingExisting = Boolean(projectSelectedId) && projectsList.some((p) => p.id === projectSelectedId);
    if (!isEditingExisting && existingIdx !== -1) {
      toast.error("Проект с таким id уже существует. Выбери его слева и редактируй.");
      return;
    }
    const next = [...projectsList];
    if (isEditingExisting) {
      const idx = next.findIndex((p) => p.id === projectSelectedId);
      if (idx === -1) next.push(nextItem);
      else next[idx] = nextItem;
      // if id changed, ensure selection updates too
      setProjectSelectedId(nextItem.id);
    } else {
      next.push(nextItem);
      setProjectSelectedId(nextItem.id);
    }
    await persistProjectsList(next);
  }, [persistProjectsList, projectDraft, projectSelectedId, projectsList]);

  const deleteProject = useCallback(async () => {
    if (!projectSelectedId) return;
    const next = projectsList.filter((p) => p.id !== projectSelectedId);
    await persistProjectsList(next);
    resetProjectDraft();
  }, [persistProjectsList, projectSelectedId, projectsList, resetProjectDraft]);

  const uploadProjectImage = useCallback(
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
        setUploadingProjectImage(true);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
          reader.readAsDataURL(file);
        });
        const resp = await fetchJson<{ url: string }>(`/api/admin/upload-project-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(authHeaderValue) },
          body: JSON.stringify({ dataUrl, filename: file.name }),
        });
        setProjectDraft((prev) => ({ ...prev, image: resp.url }));
        toast.success("Фото загружено");
      } catch (e: any) {
        console.warn(e);
        toast.error(`Ошибка загрузки: ${e?.message || "unknown"}`);
      } finally {
        setUploadingProjectImage(false);
        if (projectImageInputRef.current) projectImageInputRef.current.value = "";
      }
    },
    [authHeaderValue, verifyAuth],
  );

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
                    <div className="space-y-1">
                      <Input
                        placeholder="Slug (опционально)"
                        value={blogSlugOverride}
                        onChange={(e) => setBlogSlugOverride(e.target.value)}
                        disabled={Boolean(blogSelectedSlug)}
                      />
                      <div className="text-xs text-muted-foreground">
                        Slug — это часть ссылки (URL). Например: <span className="font-mono">/blog/my-post</span>.
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => wrapBlogSelection("**", "**", "жирный")}>
                      Жирный
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => wrapBlogSelection("*", "*", "курсив")}>
                      Курсив
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => prefixBlogLines("## ")}>
                      H2
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => prefixBlogLines("- ")}>
                      Список
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => wrapBlogSelection("[", "](https://example.com)", "ссылка")}
                    >
                      Ссылка
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => wrapBlogSelection("`", "`", "код")}>
                      Код
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertIntoBlog("\n\n```text\nТекст...\n```\n")}
                    >
                      Блок кода
                    </Button>
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
                    <MarkdownContent
                      markdown={blogContent}
                      proseClassName="max-w-none bg-secondary/20 rounded-lg p-4 dark:prose-invert"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="projects" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Проекты</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Button className="flex-1" variant="secondary" onClick={resetProjectDraft}>
                      + Новый проект
                    </Button>
                    <Button className="shrink-0" variant="outline" onClick={loadProjects}>
                      Обновить
                    </Button>
                  </div>
                  <div className="max-h-[520px] overflow-auto space-y-2">
                    {projectsList.map((p) => (
                      <button
                        key={p.id}
                        className={`w-full text-left rounded-md border px-3 py-2 hover:border-primary/60 ${
                          p.id === projectSelectedId ? "border-primary" : "border-border"
                        }`}
                        onClick={() => selectProject(p.id)}
                      >
                        <div className="font-medium">{p.title || p.id}</div>
                        <div className="text-xs text-muted-foreground">{p.id}</div>
                        {p.image ? <div className="text-xs text-muted-foreground mt-1">{p.image}</div> : null}
                      </button>
                    ))}
                    {!projectsList.length && (
                      <div className="text-sm text-muted-foreground">Пока нет проектов (или файл пустой).</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Редактор проекта</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      placeholder="ID (используется в URL, напр. stroyrem)"
                      value={projectDraft.id}
                      onChange={(e) => setProjectDraft((p) => ({ ...p, id: e.target.value }))}
                    />
                    <Input
                      placeholder="Заголовок"
                      value={projectDraft.title}
                      onChange={(e) => setProjectDraft((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>

                  <Textarea
                    value={projectDraft.description}
                    onChange={(e) => setProjectDraft((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Короткое описание (карточка проекта)"
                    className="min-h-[90px]"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      placeholder="Image URL (например /projects/my.png)"
                      value={projectDraft.image}
                      onChange={(e) => setProjectDraft((p) => ({ ...p, image: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <input
                        ref={projectImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadProjectImage(f);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={uploadingProjectImage}
                        onClick={() => projectImageInputRef.current?.click()}
                      >
                        {uploadingProjectImage ? "Загрузка..." : "Загрузить фото"}
                      </Button>
                    </div>
                  </div>

                  {projectDraft.image ? (
                    <div className="rounded-md border border-border overflow-hidden">
                      <img src={projectDraft.image} alt={projectDraft.title || projectDraft.id} className="w-full h-auto" />
                    </div>
                  ) : null}

                  <Textarea
                    value={projectDraft.fullDescription}
                    onChange={(e) => setProjectDraft((p) => ({ ...p, fullDescription: e.target.value }))}
                    placeholder="Полное описание (markdown)"
                    className="min-h-[220px] font-mono"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Textarea
                      value={projectDraft.technologies.join(", ")}
                      onChange={(e) =>
                        setProjectDraft((p) => ({
                          ...p,
                          technologies: e.target.value
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="Технологии (через запятую)"
                      className="min-h-[90px]"
                    />
                    <Textarea
                      value={projectDraft.features.join("\n")}
                      onChange={(e) =>
                        setProjectDraft((p) => ({
                          ...p,
                          features: e.target.value
                            .split("\n")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="Фичи (каждая с новой строки)"
                      className="min-h-[90px]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      placeholder="Demo URL"
                      value={projectDraft.demoUrl || ""}
                      onChange={(e) => setProjectDraft((p) => ({ ...p, demoUrl: e.target.value }))}
                    />
                    <Input
                      placeholder="GitHub URL"
                      value={projectDraft.githubUrl || ""}
                      onChange={(e) => setProjectDraft((p) => ({ ...p, githubUrl: e.target.value }))}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={upsertProject}>Сохранить проект</Button>
                    <Button variant="destructive" onClick={deleteProject} disabled={!projectSelectedId}>
                      Удалить
                    </Button>
                    {projectSelectedId && (
                      <Button asChild variant="outline">
                        <a href={`/projects/${projectSelectedId}`} target="_blank" rel="noreferrer">
                          Открыть
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="pt-4 border-t border-border space-y-3">
                    <div className="text-sm font-medium">Raw JSON (опционально)</div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={loadProjects}>
                        Обновить JSON
                      </Button>
                      <Button onClick={saveProjects}>Сохранить JSON</Button>
                    </div>
                    <Textarea
                      value={projectsJson}
                      onChange={(e) => setProjectsJson(e.target.value)}
                      className="min-h-[240px] font-mono"
                    />
                  </div>

                  <div className="pt-4 border-t border-border">
                    <div className="text-sm font-medium mb-2">Предпросмотр описания</div>
                    <MarkdownContent
                      markdown={projectDraft.fullDescription}
                      proseClassName="max-w-none bg-secondary/20 rounded-lg p-4 dark:prose-invert"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
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

