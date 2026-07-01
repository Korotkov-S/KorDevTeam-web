import fs from "node:fs";
import path from "node:path";
import {
  getSeoDescription,
  getSeoTitle,
  normalizeWhitespace,
  trimDescription,
} from "./seo-descriptions.mjs";

const ROOT = process.cwd();
const PUBLIC_BLOG_DIR = path.join(ROOT, "public", "blog");
const DIST_DIR = path.join(ROOT, "dist");
const DIST_BLOG_DIR = path.join(DIST_DIR, "blog");
const DIST_INDEX_HTML = path.join(DIST_DIR, "index.html");
const SITE_URL = (process.env.SITE_URL || "https://kordev.team").replace(
  /\/+$/,
  "",
);
const SITE_NAME = "KorDevTeam";

const PROJECT_ALIASES = new Map([["Media & Entertainment", "media-entertainment"]]);

function toProjectSlug(id) {
  const raw = String(id || "").trim();
  if (PROJECT_ALIASES.has(raw)) return PROJECT_ALIASES.get(raw);
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const UNDER_METUP_VIDEOS = [
  {
    slug: "video-1",
    title: "Under Metup №1",
    description:
      "Запись первого Under Metup: Android, безопасность Web3, платформа .NET, доклады спикеров и полезные материалы для IT-сообщества.",
    date: "2025",
    duration: "Видео",
    tags: ["Under Metup", "Android", "Web3", ".NET"],
    program: [
      "Каждый юнит на счету",
      "Основы безопасности в Web3. Как не стать жертвой взлома",
      "Платформа .NET",
    ],
  },
  {
    slug: "video-2",
    title: "Under Metup №2",
    description:
      "Запись второго Under Metup: data driven development, WebRTC, нетворкинг в IT и практические доклады для разработчиков.",
    date: "2025",
    duration: "Видео",
    tags: ["Under Metup", "Data", "WebRTC", "Нетворкинг"],
    program: [
      "Data Driven Development: сначала данные, потом код",
      "Позвони мне, позвони при помощи WebRTC",
      "Нетворкинг в IT для начинающих",
    ],
  },
  {
    slug: "video-3",
    title: "Under Metup №3",
    description:
      "Запись третьего Under Metup: автоматизация коммитов и PR, стандарты CI/CD и постановка целей на 2026 год.",
    date: "2026",
    duration: "Видео",
    tags: ["Under Metup", "CI/CD", "Автоматизация", "Цели"],
    program: [
      "Автоматизация коммитов и PR: стандарты и CI/CD на практике",
      "Учимся ставить цели на 2026 так, чтобы не забросить их 1 февраля",
    ],
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripMd(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getRuProjects() {
  const projects = readJsonArray(path.join(ROOT, "public", "content", "projects.ru.json"));
  return projects
    .filter((p) => p && p.id)
    .map((p) => {
      const title = String(p.title || p.id);
      const rawDescription = normalizeWhitespace(p.description || title);
      const description =
        rawDescription.length < 120
          ? trimDescription(`${title}: ${rawDescription}`, 160)
          : trimDescription(rawDescription, 160);
      return {
        id: String(p.id),
        slug: toProjectSlug(p.id),
        title,
        description,
        fullDescription: String(p.fullDescription || ""),
        image: normalizePublicAssetUrl(p.image || ""),
        technologies: Array.isArray(p.technologies) ? p.technologies.map(String) : [],
        features: Array.isArray(p.features) ? p.features.map(String) : [],
        demoUrl: p.demoUrl ? String(p.demoUrl) : "",
      };
    });
}

function baseJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/opengraphlogo.jpeg`,
      sameAs: ["https://t.me/kordevteam"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "ru-RU",
    },
  ];
}

function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll("</script", "<\\/script")}</script>`;
}

function parseFrontmatter(md) {
  // Very small subset of YAML frontmatter:
  // ---
  // title: ...
  // excerpt: ...
  // coverUrl: ...
  // cover: ...
  // ---
  if (!md.startsWith("---\n")) return { frontmatter: null, content: md };
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: null, content: md };

  const fmRaw = md.slice(4, end).trim();
  const content = md.slice(end + "\n---\n".length);
  const fm = {};
  const lines = fmRaw.split("\n");
  let currentKey = null;

  for (const line of lines) {
    const keyVal = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
    if (keyVal) {
      currentKey = keyVal[1];
      const val = keyVal[2];
      fm[currentKey] = val === "" ? "" : val.replace(/^"(.*)"$/, "$1");
      continue;
    }
    const listItem = line.match(/^\s*-\s+(.*)\s*$/);
    if (listItem && currentKey) {
      if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
      fm[currentKey].push(listItem[1]);
    }
  }

  return { frontmatter: fm, content };
}

function isImageOnlyBlock(block) {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((l) =>
    /^!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)\s*$/.test(l),
  );
}

function isMediaOrSourceOnlyBlock(block) {
  if (isImageOnlyBlock(block)) return true;

  const normalized = stripMd(block).toLowerCase();
  if (!normalized) return true;
  if (normalized === "видео") return true;
  if (/^видео\s+смотреть видео(?:\s+\d+)?$/.test(normalized)) return true;
  if (/^смотреть видео(?:\s+\d+)?$/.test(normalized)) return true;
  if (normalized.startsWith("источник: telegram-канал")) return true;
  return false;
}

function extractTitleAndExcerpt(md) {
  const { frontmatter, content } = parseFrontmatter(md);
  const titleMatch = content.match(/^\s*#\s+(.+)\s*$/m);
  const title = (frontmatter?.title || titleMatch?.[1] || "Blog").toString().trim();

  // First "paragraph-ish" block after title (or from start)
  if (frontmatter?.excerpt) {
    return { title, excerpt: String(frontmatter.excerpt).trim().slice(0, 180) };
  }

  const withoutTitle = content.replace(/^\s*#\s+.+\s*$/m, "").trim();
  const blocks = withoutTitle
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const firstTextBlock = blocks.find((b) => !isMediaOrSourceOnlyBlock(b)) || "";
  const excerpt = stripMd(firstTextBlock || title).slice(0, 180);

  return { title, excerpt };
}

function stripFirstMarkdownH1(md) {
  return md.replace(/^\s*#\s+.+\s*$/m, "").trim();
}

function stripFirstMarkdownHeading(md) {
  return md.replace(/^\s*#{1,6}\s+.+\s*$/m, "").trim();
}

function extractLegacyMeta(md) {
  const date =
    md.match(/\*\*(?:Дата публикации|Publication Date)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Дата публикации|Publication Date)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";
  const updatedDate =
    md.match(/\*\*(?:Дата обновления|Updated Date|Last Updated)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Дата обновления|Updated Date|Last Updated)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";
  return {
    date: date.trim(),
    updatedDate: updatedDate.trim() || date.trim(),
  };
}

function parseDateToIso(dateStr) {
  const s = String(dateStr || "").trim();
  if (!s) return "";

  const monthsRu = {
    января: "01",
    февраля: "02",
    марта: "03",
    апреля: "04",
    мая: "05",
    июня: "06",
    июля: "07",
    августа: "08",
    сентября: "09",
    октября: "10",
    ноября: "11",
    декабря: "12",
  };
  const monthsEn = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };

  const ru = s.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/i);
  if (ru) {
    const [, day, month, year] = ru;
    const monthNum = monthsRu[month.toLowerCase()];
    if (monthNum) return `${year}-${monthNum}-${day.padStart(2, "0")}`;
  }

  const en = s.match(/^([a-z]+)\s+(\d{1,2}),\s+(\d{4})$/i);
  if (en) {
    const [, month, day, year] = en;
    const monthNum = monthsEn[month.toLowerCase()];
    if (monthNum) return `${year}-${monthNum}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function extractFaqItems(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const faqStart = lines.findIndex((line) =>
    /^##\s+(FAQ|Частые вопросы)\s*$/i.test(line.trim()),
  );
  if (faqStart === -1) return [];

  const items = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const answer = stripMd(current.answer.join(" ")).trim();
    if (current.question && answer) {
      items.push({ question: current.question, answer });
    }
  };

  for (let i = faqStart + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^##\s+/.test(line)) break;
    const questionMatch = line.match(/^###\s+(.+?)\s*$/);
    if (questionMatch) {
      flush();
      current = { question: stripMd(questionMatch[1]), answer: [] };
      continue;
    }
    if (current && line && !/^\*\*(?:Теги|Tags|Дата публикации|Дата обновления)/i.test(line)) {
      current.answer.push(line);
    }
  }
  flush();

  return items.slice(0, 6);
}

// Minimal markdown -> HTML. Good enough for indexing (headings, paragraphs, links, lists, code).
function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];

  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let listType = null; // "ul" | "ol"

  const flushList = () => {
    if (!listType) return;
    out.push(listType === "ul" ? "</ul>" : "</ol>");
    listType = null;
  };

  const inline = (s) => {
    let x = escapeHtml(s);
    x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    x = x.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    x = x.replace(/`([^`]+)`/g, "<code>$1</code>");
    return x;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fences
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      if (!inCode) {
        flushList();
        inCode = true;
        codeLang = fenceMatch[1] || "";
        codeBuf = [];
      } else {
        const code = escapeHtml(codeBuf.join("\n"));
        out.push(
          `<pre><code${codeLang ? ` class="language-${codeLang}"` : ""}>${code}</code></pre>`,
        );
        inCode = false;
        codeLang = "";
        codeBuf = [];
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)\s*$/);
    if (hMatch) {
      flushList();
      const level = hMatch[1].length;
      out.push(`<h${level}>${inline(hMatch[2])}</h${level}>`);
      continue;
    }

    // Lists
    const ulMatch = line.match(/^\s*-\s+(.+)\s*$/);
    const olMatch = line.match(/^\s*\d+\.\s+(.+)\s*$/);
    if (ulMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${inline(ulMatch[1])}</li>`);
      continue;
    }
    if (olMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
        out.push("<ol>");
      }
      out.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      flushList();
      continue;
    }

    // Paragraph
    flushList();
    out.push(`<p>${inline(line.trim())}</p>`);
  }

  flushList();
  return out.join("\n");
}

function injectSeoAndBody({
  indexHtml,
  title,
  description,
  canonicalUrl,
  ogImage,
  ogType = "website",
  jsonLd = [],
  bodyHtml,
}) {
  let html = indexHtml;
  const safeDescription = trimDescription(description, 160);

  // Title
  if (/<title>.*<\/title>/i.test(html)) {
    html = html.replace(
      /<title>.*<\/title>/i,
      `<title>${escapeHtml(title)}</title>`,
    );
  } else {
    html = html.replace(
      /<head>/i,
      `<head>\n<title>${escapeHtml(title)}</title>`,
    );
  }

  // Description (replace or insert)
  if (/<meta\s+name=["']description["'][^>]*>/i.test(html)) {
    html = html.replace(
      /<meta\s+name=["']description["'][^>]*>/i,
      `<meta name="description" content="${escapeHtml(safeDescription)}">`,
    );
  } else {
    html = html.replace(
      /<head>/i,
      `<head>\n<meta name="description" content="${escapeHtml(safeDescription)}">`,
    );
  }

  // Canonical (replace or insert)
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(html)) {
    html = html.replace(
      /<link\s+rel=["']canonical["'][^>]*>/i,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    );
  } else {
    html = html.replace(
      /<\/head>/i,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">\n</head>`,
    );
  }

  // OG tags (replace if present, otherwise insert before </head>)
  const replaceOrAddMeta = (property, content) => {
    const re = new RegExp(`<meta\\s+property=["']${property}["'][^>]*>`, "i");
    const tag = `<meta property="${property}" content="${escapeHtml(content)}">`;
    if (re.test(html)) html = html.replace(re, tag);
    else html = html.replace(/<\/head>/i, `${tag}\n</head>`);
  };

  replaceOrAddMeta("og:type", ogType);
  replaceOrAddMeta("og:title", title);
  replaceOrAddMeta("og:description", safeDescription);
  replaceOrAddMeta("og:url", canonicalUrl);
  if (ogImage) replaceOrAddMeta("og:image", ogImage);

  // Twitter tags (nice-to-have)
  const replaceOrAddTwitter = (name, content) => {
    const re = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, "i");
    const tag = `<meta name="${name}" content="${escapeHtml(content)}">`;
    if (re.test(html)) html = html.replace(re, tag);
    else html = html.replace(/<\/head>/i, `${tag}\n</head>`);
  };
  replaceOrAddTwitter("twitter:title", title);
  replaceOrAddTwitter("twitter:description", safeDescription);
  if (ogImage) replaceOrAddTwitter("twitter:image", ogImage);

  const schemas = [...baseJsonLd(), ...jsonLd].filter(Boolean);
  if (schemas.length) {
    html = html.replace(/<\/head>/i, `${jsonLdScript(schemas)}\n</head>`);
  }

  // Inject pre-rendered content for crawlers (React will overwrite on load; that's OK)
  html = html.replace(
    /<div\s+id=["']root["']\s*><\/div>/i,
    `<div id="root">${bodyHtml}</div>`,
  );

  return html;
}

function extractFirstMarkdownImage(md) {
  const match = md.match(/!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/m);
  return (match?.[1] || "").trim();
}

function extractFirstHtmlImage(md) {
  const match = md.match(/<img[^>]+src=["']([^"']+)["']/im);
  return (match?.[1] || "").trim();
}

function normalizePublicAssetUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  return `/${s.replace(/^\.\//, "")}`;
}

function extractCoverUrl(md) {
  const { frontmatter, content } = parseFrontmatter(md);
  const cover = (
    frontmatter?.coverUrl ||
    frontmatter?.cover ||
    extractFirstMarkdownImage(content) ||
    extractFirstHtmlImage(content)
  )
    .toString()
    .trim()
    .replace(/^"(.*)"$/, "$1");
  return normalizePublicAssetUrl(cover);
}

function toAbsoluteOgImage(src) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return `${SITE_URL}${src}`;
  return "";
}

function getSlugsFromPublic() {
  if (!fs.existsSync(PUBLIC_BLOG_DIR)) return [];
  const files = fs.readdirSync(PUBLIC_BLOG_DIR);
  const slugs = new Set();
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    if (f.endsWith(".en.md")) continue; // RU as default for static HTML
    const slug = f.replace(/\.md$/, "");
    slugs.add(slug);
  }
  return [...slugs].sort();
}

function writeRouteHtml(routePath, html) {
  if (routePath === "/") {
    fs.writeFileSync(DIST_INDEX_HTML, html, "utf-8");
    return;
  }

  const clean = routePath.replace(/^\/+/, "").replace(/\/+$/, "");
  const htmlPath = path.join(DIST_DIR, `${clean}.html`);
  ensureDir(path.dirname(htmlPath));
  fs.writeFileSync(htmlPath, html, "utf-8");
  const dir = path.join(DIST_DIR, clean);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf-8");
}

function generateHomePage({ indexHtml, blogItems, projects }) {
  const title = "Автоматизация продаж и операционных процессов";
  const description =
    "KorDevTeam разрабатывает CRM, веб-сервисы, мобильные приложения и интеграции под ключ для автоматизации продаж и операций бизнеса.";
  const canonicalUrl = `${SITE_URL}/`;
  const ogImage = `${SITE_URL}/opengraphlogo.jpeg`;

  const projectLinks = projects.map((project) => {
    return `          <li><a href="/project/${escapeHtml(project.slug)}">${escapeHtml(project.title)}</a> — ${escapeHtml(project.description)}</li>`;
  });
  const blogLinks = blogItems.slice(0, 10).map((post) => {
    return `          <li><a href="/blog/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a> — ${escapeHtml(post.excerpt)}</li>`;
  });

  const bodyHtml = [
    `<main class="min-h-screen pt-20">`,
    `  <section class="container mx-auto px-4 py-12">`,
    `    <h1>Автоматизация продаж и операционных процессов</h1>`,
    `    <p>${escapeHtml(description)}</p>`,
    `    <nav aria-label="Основные разделы">`,
    `      <a href="/#services">Услуги</a>`,
    `      <a href="/#projects">Проекты</a>`,
    `      <a href="/blog">Блог</a>`,
    `      <a href="/video">Видео</a>`,
    `      <a href="/#contact">Контакты</a>`,
    `    </nav>`,
    `  </section>`,
    `  <section id="services" class="container mx-auto px-4 py-8">`,
    `    <h2>Услуги</h2>`,
    `    <p>Проектируем и разрабатываем CRM, веб-сервисы, мобильные приложения, личные кабинеты, интеграции с API, Telegram-боты и внутренние инструменты для команд.</p>`,
    `    <ul>`,
    `      <li>Автоматизация продаж, заявок, задач и клиентской базы.</li>`,
    `      <li>Разработка веб-сервисов и мобильных приложений под бизнес-процессы.</li>`,
    `      <li>Интеграции с CRM, платежами, рассылками, аналитикой и внешними API.</li>`,
    `    </ul>`,
    `  </section>`,
    `  <section class="container mx-auto px-4 py-8">`,
    `    <h2>Красотуля-CRM</h2>`,
    `    <p>Собственный продукт KorDevTeam для малого бизнеса: клиенты, записи, задачи, онлайн-запись, рассылки и автоматизация рутины.</p>`,
    `    <p><a href="https://krasotula.com">Перейти на сайт Красотуля-CRM</a></p>`,
    `  </section>`,
    `  <section id="projects" class="container mx-auto px-4 py-8">`,
    `    <h2>Кейсы и проекты</h2>`,
    `    <ul>`,
    ...projectLinks,
    `    </ul>`,
    `  </section>`,
    `  <section id="blog" class="container mx-auto px-4 py-8">`,
    `    <h2>Статьи</h2>`,
    `    <ul>`,
    ...blogLinks,
    `    </ul>`,
    `  </section>`,
    `  <section class="container mx-auto px-4 py-8">`,
    `    <h2>Видео</h2>`,
    `    <p><a href="/video">Посмотреть видео-презентацию KorDevTeam</a> и записи Under Metup.</p>`,
    `  </section>`,
    `</main>`,
  ].join("\n");

  const html = injectSeoAndBody({
    indexHtml,
    title,
    description,
    canonicalUrl,
    ogImage,
    ogType: "website",
    jsonLd: [breadcrumbJsonLd([{ name: "Главная", url: canonicalUrl }])],
    bodyHtml,
  });
  writeRouteHtml("/", html);
}

function generateVideoPage({ indexHtml }) {
  const title = "Видео KorDevTeam";
  const description =
    "Видео-презентация KorDevTeam: подход к разработке, примеры работ, автоматизация бизнеса, веб-сервисы, CRM и мобильные приложения.";
  const canonicalUrl = `${SITE_URL}/video`;
  const bodyHtml = [
    `<main class="min-h-screen pt-20">`,
    `  <section class="container mx-auto px-4 py-12">`,
    `    <h1>Видео KorDevTeam</h1>`,
    `    <p>${escapeHtml(description)}</p>`,
    `    <p><a href="/">Вернуться на главную</a></p>`,
    `    <video controls preload="metadata" poster="/opengraphlogo.jpeg">`,
    `      <source src="/default.mp4" type="video/mp4">`,
    `    </video>`,
    `  </section>`,
    `</main>`,
  ].join("\n");

  const html = injectSeoAndBody({
    indexHtml,
    title,
    description,
    canonicalUrl,
    ogImage: `${SITE_URL}/opengraphlogo.jpeg`,
    ogType: "video.other",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Главная", url: `${SITE_URL}/` },
        { name: "Видео", url: canonicalUrl },
      ]),
    ],
    bodyHtml,
  });
  writeRouteHtml("/video", html);
}

function generateUnderMetupPages({ indexHtml }) {
  for (const video of UNDER_METUP_VIDEOS) {
    const canonicalUrl = `${SITE_URL}/under-metup/${video.slug}`;
    const bodyHtml = [
      `<main class="min-h-screen pt-20">`,
      `  <article class="container mx-auto px-4 py-12">`,
      `    <h1>${escapeHtml(video.title)}</h1>`,
      `    <p>${escapeHtml(video.description)}</p>`,
      `    <p>${escapeHtml(video.date)} · ${escapeHtml(video.duration)}</p>`,
      `    <ul>`,
      ...video.program.map((item) => `      <li>${escapeHtml(item)}</li>`),
      `    </ul>`,
      `    <p><a href="/">Вернуться на главную</a></p>`,
      `  </article>`,
      `</main>`,
    ].join("\n");

    const html = injectSeoAndBody({
      indexHtml,
      title: video.title,
      description: video.description,
      canonicalUrl,
      ogImage: `${SITE_URL}/opengraphlogo.jpeg`,
      ogType: "video.other",
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Главная", url: `${SITE_URL}/` },
          { name: "Under Metup", url: `${SITE_URL}/#under-metup` },
          { name: video.title, url: canonicalUrl },
        ]),
      ],
      bodyHtml,
    });
    writeRouteHtml(`/under-metup/${video.slug}`, html);
  }
}

function generateProjectPages({ indexHtml, projects }) {
  for (const project of projects) {
    const canonicalUrl = `${SITE_URL}/project/${project.slug}`;
    const bodyHtml = [
      `<main class="min-h-screen pt-20">`,
      `  <article class="container mx-auto px-4 py-12">`,
      `    <h1>${escapeHtml(project.title)}</h1>`,
      `    <p>${escapeHtml(project.description)}</p>`,
      `    <p><img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}"></p>`,
      `    <h2>Технологии</h2>`,
      `    <ul>`,
      ...project.technologies.map((item) => `      <li>${escapeHtml(item)}</li>`),
      `    </ul>`,
      `    <h2>Что сделали</h2>`,
      markdownToHtml(stripFirstMarkdownHeading(project.fullDescription)),
      `    <h2>Возможности</h2>`,
      `    <ul>`,
      ...project.features.map((item) => `      <li>${escapeHtml(item)}</li>`),
      `    </ul>`,
      project.demoUrl ? `    <p><a href="${escapeHtml(project.demoUrl)}">Открыть проект</a></p>` : "",
      `    <p><a href="/#projects">Все проекты</a></p>`,
      `  </article>`,
      `</main>`,
    ].join("\n");

    const html = injectSeoAndBody({
      indexHtml,
      title: project.title,
      description: project.description,
      canonicalUrl,
      ogImage: toAbsoluteOgImage(project.image) || `${SITE_URL}/opengraphlogo.jpeg`,
      ogType: "article",
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Главная", url: `${SITE_URL}/` },
          { name: "Проекты", url: `${SITE_URL}/#projects` },
          { name: project.title, url: canonicalUrl },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: project.title,
          description: project.description,
          url: canonicalUrl,
          image: toAbsoluteOgImage(project.image) || `${SITE_URL}/opengraphlogo.jpeg`,
          creator: { "@id": `${SITE_URL}/#organization` },
        },
      ],
      bodyHtml,
    });
    writeRouteHtml(`/project/${project.slug}`, html);
  }
}

function generateBlogIndexPage({ indexHtml, slugs }) {
  const title = "Блог KorDevTeam";
  const description =
    "Статьи KorDevTeam про разработку веб-сервисов, CRM, мобильных приложений, автоматизацию бизнеса, интеграции и кейсы команды.";
  const canonicalUrl = `${SITE_URL}/blog`;
  const ogImage = `${SITE_URL}/opengraphlogo.jpeg`;

  const items = [];
  for (const slug of slugs) {
    try {
      const mdPath = path.join(PUBLIC_BLOG_DIR, `${slug}.md`);
      const md = fs.readFileSync(mdPath, "utf-8");
      const meta = extractTitleAndExcerpt(md);
      items.push({ slug, title: meta.title, excerpt: getSeoDescription(slug, meta.excerpt) });
    } catch {
      items.push({ slug, title: slug, excerpt: "" });
    }
  }

  const bodyHtml = [
    `<div class="min-h-screen pt-20">`,
    `  <div class="container mx-auto px-4 py-8">`,
    `    <article class="max-w-4xl mx-auto">`,
    `      <header class="mb-12 pb-8 border-b border-border">`,
    `        <h1 class="text-4xl md:text-5xl mb-6">${escapeHtml(title)}</h1>`,
    `        <p class="text-muted-foreground text-lg leading-relaxed mb-6">${escapeHtml(description)}</p>`,
    `      </header>`,
    `      <div class="prose prose-invert prose-lg max-w-none">`,
    `        <ul>`,
    ...items.map((x) => {
      const suffix = x.excerpt ? ` — ${escapeHtml(x.excerpt)}` : "";
      return `          <li><a href="/blog/${escapeHtml(x.slug)}">${escapeHtml(x.title)}</a>${suffix}</li>`;
    }),
    `        </ul>`,
    `      </div>`,
    `    </article>`,
    `  </div>`,
    `</div>`,
  ].join("\n");

  const pageHtml = injectSeoAndBody({
    indexHtml,
    title,
    description,
    canonicalUrl,
    ogImage,
    ogType: "website",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Главная", url: `${SITE_URL}/` },
        { name: "Блог", url: canonicalUrl },
      ]),
    ],
    bodyHtml,
  });

  // /blog (folder-style)
  ensureDir(DIST_BLOG_DIR);
  fs.writeFileSync(path.join(DIST_BLOG_DIR, "index.html"), pageHtml, "utf-8");
  // /blog.html (works with nginx try_files $uri.html)
  fs.writeFileSync(path.join(DIST_DIR, "blog.html"), pageHtml, "utf-8");
}

function buildRedirects(slugs, projects) {
  const underMetupVideos = UNDER_METUP_VIDEOS.map((video) => video.slug);

  const lines = [];
  lines.push("# Auto-generated. Do not edit by hand.");
  lines.push("");
  lines.push("# Canonical URL redirects");
  lines.push("/blog/    /blog    301!");
  lines.push("/video/    /video    301!");
  lines.push("/project/Media%20%26%20Entertainment    /project/media-entertainment    301!");
  lines.push("/project/Media%20&%20Entertainment    /project/media-entertainment    301!");
  lines.push("");
  lines.push("# Cache headers");
  lines.push("/assets/*  Cache-Control: public, max-age=31536000, immutable");
  lines.push("");
  lines.push("# Static blog pages (preferred for SEO)");
  lines.push(`/blog    /blog/index.html    200`);
  for (const slug of slugs) {
    lines.push(`/blog/${slug}    /blog/${slug}.html    200`);
  }
  lines.push("");
  lines.push("# Static app pages (preferred for SEO)");
  lines.push("/video    /video.html    200");
  lines.push("/admin    /index.html    200");
  for (const video of underMetupVideos) {
    lines.push(`/under-metup/${video}    /under-metup/${video}.html    200`);
  }
  for (const project of projects) {
    lines.push(`/project/${project.slug}    /project/${project.slug}.html    200`);
  }
  lines.push("");
  lines.push("# Unknown URLs must stay real 404s, not soft-404 SPA pages");
  lines.push("/*    /404.html    404");
  lines.push("");
  return lines.join("\n");
}

function buildSitemapBlogXml(slugs) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = slugs
    .map((slug) => {
      const loc = `${SITE_URL}/blog/${slug}`;
      return [
        "  <url>",
        `    <loc>${escapeHtml(loc)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "    <changefreq>monthly</changefreq>",
        "    <priority>0.9</priority>",
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

function buildFullSitemapXml(blogSlugs, projects) {
  const today = new Date().toISOString().slice(0, 10);

  // Static pages
  const staticPages = [
    { loc: "/", priority: "1.0", changefreq: "weekly" },
    { loc: "/blog", priority: "0.9", changefreq: "weekly" },
    { loc: "/video", priority: "0.8", changefreq: "monthly" },
  ];

  // Under Metup videos
  const underMetupVideos = UNDER_METUP_VIDEOS.map((video) => video.slug);

  const urls = [];

  // Static pages
  for (const page of staticPages) {
    urls.push(
      [
        "  <url>",
        `    <loc>${SITE_URL}${page.loc}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <changefreq>${page.changefreq}</changefreq>`,
        `    <priority>${page.priority}</priority>`,
        "  </url>",
      ].join("\n"),
    );
  }

  // Blog posts
  for (const slug of blogSlugs) {
    urls.push(
      [
        "  <url>",
        `    <loc>${SITE_URL}/blog/${slug}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "    <changefreq>monthly</changefreq>",
        "    <priority>0.9</priority>",
        "  </url>",
      ].join("\n"),
    );
  }

  // Under Metup videos
  for (const video of underMetupVideos) {
    urls.push(
      [
        "  <url>",
        `    <loc>${SITE_URL}/under-metup/${video}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "    <changefreq>monthly</changefreq>",
        "    <priority>0.8</priority>",
        "  </url>",
      ].join("\n"),
    );
  }

  // Projects
  for (const project of projects) {
    urls.push(
      [
        "  <url>",
        `    <loc>${SITE_URL}/project/${project.slug}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "    <changefreq>monthly</changefreq>",
        "    <priority>0.8</priority>",
        "  </url>",
      ].join("\n"),
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls.join("\n"),
    "</urlset>",
    "",
  ].join("\n");
}

function main() {
  if (!fs.existsSync(DIST_INDEX_HTML)) {
    console.error(
      `[generate-blog-pages] Missing ${DIST_INDEX_HTML}. Run build first.`,
    );
    process.exit(1);
  }

  const slugs = getSlugsFromPublic();
  if (slugs.length === 0) {
    console.warn("[generate-blog-pages] No blog slugs found in public/blog");
    return;
  }

  const indexHtml = fs.readFileSync(DIST_INDEX_HTML, "utf-8");
  ensureDir(DIST_BLOG_DIR);
  const projects = getRuProjects();

  // Blog index page (/blog)
  generateBlogIndexPage({ indexHtml, slugs });

  const blogItems = [];
  for (const slug of slugs) {
    try {
      const md = fs.readFileSync(path.join(PUBLIC_BLOG_DIR, `${slug}.md`), "utf-8");
      const meta = extractTitleAndExcerpt(md);
      blogItems.push({
        slug,
        title: meta.title,
        excerpt: getSeoDescription(slug, meta.excerpt),
      });
    } catch {
      blogItems.push({ slug, title: slug, excerpt: "" });
    }
  }

  generateHomePage({ indexHtml, blogItems, projects });
  generateVideoPage({ indexHtml });
  generateUnderMetupPages({ indexHtml });
  generateProjectPages({ indexHtml, projects });

  for (const slug of slugs) {
    const mdPath = path.join(PUBLIC_BLOG_DIR, `${slug}.md`);
    const md = fs.readFileSync(mdPath, "utf-8");
    const { title, excerpt } = extractTitleAndExcerpt(md);
    const seoTitle = getSeoTitle(slug, title, "ru");
    const description = getSeoDescription(slug, excerpt);
    const legacy = extractLegacyMeta(md);
    const datePublished = parseDateToIso(legacy.date);
    const dateModified = parseDateToIso(legacy.updatedDate || legacy.date);
    const faqItems = extractFaqItems(md);
    const { content } = parseFrontmatter(md);
    const mdBody = stripFirstMarkdownH1(content);
    const coverUrl = extractCoverUrl(md);
    const ogImage = toAbsoluteOgImage(
      coverUrl || extractFirstMarkdownImage(mdBody) || extractFirstMarkdownImage(md),
    );

    const bodyHtml = [
      `<div class="min-h-screen pt-20">`,
      `  <div class="container mx-auto px-4 py-8">`,
      `    <article class="max-w-4xl mx-auto">`,
      `      <header class="mb-12 pb-8 border-b border-border">`,
      `        <h1 class="text-4xl md:text-5xl mb-6">${escapeHtml(title)}</h1>`,
      `      </header>`,
      `      <div class="prose prose-invert prose-lg max-w-none">`,
      markdownToHtml(mdBody),
      `      </div>`,
      `    </article>`,
      `  </div>`,
      `</div>`,
    ].join("\n");

    const canonicalUrl = `${SITE_URL}/blog/${slug}`;
    const jsonLd = [
      breadcrumbJsonLd([
        { name: "Главная", url: `${SITE_URL}/` },
        { name: "Блог", url: `${SITE_URL}/blog` },
        { name: title, url: canonicalUrl },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: title,
        description,
        image: ogImage || `${SITE_URL}/opengraphlogo.jpeg`,
        author: { "@id": `${SITE_URL}/#organization` },
        publisher: { "@id": `${SITE_URL}/#organization` },
        mainEntityOfPage: canonicalUrl,
        url: canonicalUrl,
        inLanguage: "ru-RU",
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified ? { dateModified } : {}),
      },
    ];
    if (faqItems.length) {
      jsonLd.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      });
    }

    const pageHtml = injectSeoAndBody({
      indexHtml,
      title: `${seoTitle} | ${SITE_NAME}`,
      description,
      canonicalUrl,
      ogImage,
      ogType: "article",
      jsonLd,
      bodyHtml,
    });

    // Provide raw markdown to the app to avoid "flash" (React can render immediately without spinner)
    const prerenderJson = JSON.stringify({
      slug,
      lang: "ru",
      md: mdBody,
      seoTitle,
      description,
    }).replaceAll("</script", "<\\/script");
    const pageHtmlWithPrerender = pageHtml.replace(
      /<\/body>/i,
      `<script id="__BLOG_PRERENDER_DATA__" type="application/json">${prerenderJson}</script>\n</body>`,
    );

    // 1) Classic "slug.html" (works great with nginx try_files $uri.html)
    fs.writeFileSync(
      path.join(DIST_BLOG_DIR, `${slug}.html`),
      pageHtmlWithPrerender,
      "utf-8",
    );

    // 2) Folder-style "/blog/slug/index.html" (works on many static hosts without rewrite rules)
    const dirStyle = path.join(DIST_BLOG_DIR, slug);
    ensureDir(dirStyle);
    fs.writeFileSync(
      path.join(dirStyle, "index.html"),
      pageHtmlWithPrerender,
      "utf-8",
    );
  }

  // Netlify-style redirects (also useful as documentation/source-of-truth)
  const redirects = buildRedirects(slugs, projects);
  fs.writeFileSync(path.join(DIST_DIR, "_redirects"), redirects, "utf-8");
  fs.writeFileSync(path.join(ROOT, "public", "_redirects"), redirects, "utf-8");

  // Blog-only sitemap
  const sitemapBlog = buildSitemapBlogXml(slugs);
  fs.writeFileSync(
    path.join(DIST_DIR, "sitemap-blog.xml"),
    sitemapBlog,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(ROOT, "public", "sitemap-blog.xml"),
    sitemapBlog,
    "utf-8",
  );

  // Full sitemap with all pages (auto-generated, includes new blogs)
  const sitemapFull = buildFullSitemapXml(slugs, projects);
  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), sitemapFull, "utf-8");
  fs.writeFileSync(
    path.join(ROOT, "public", "sitemap.xml"),
    sitemapFull,
    "utf-8",
  );

  console.log(
    `[generate-blog-pages] Generated ${slugs.length} blog pages + sitemaps + _redirects`,
  );
}

main();
