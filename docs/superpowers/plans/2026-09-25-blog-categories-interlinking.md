# Blog Categories and Interlinking Implementation Plan

> **For the implementing agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six indexable blog category pages and curated three-article recommendations for all 46 Russian articles.

**Architecture:** Store each article's primary category and related article slugs in the version-controlled blog catalog, validate and synchronize them into the existing article payload, and resolve only published related entries at request time. Keep category copy in one typed shared configuration, render category hubs from published database records, and add non-duplicated category URLs to the blog sitemap.

**Tech Stack:** React 19, React Router 7, TypeScript, Zod, Drizzle ORM/PostgreSQL, Node test runner, Testing Library, Cheerio, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-25-blog-categories-interlinking-design.md`

## Global Constraints

- Preserve every existing article URL, publication date, Markdown body, tag, image and canonical.
- Each Russian article must have exactly one category and exactly three unique, existing, non-self related slugs.
- Only the six approved categories may be indexable; tags remain non-linked visual labels.
- Category pages render every published member in SSR without category pagination.
- Unknown or empty categories return 404 and are omitted from the sitemap.
- Existing body links to services, cases and articles remain unchanged.
- Do not modify the content_relations table or admin UI in this iteration.
- Preserve all unrelated dirty worktree files and stage only files owned by each task.

## Review Focus

- A valid related slug that points to an unpublished article is omitted without breaking the source article page; Task 5 tests this.
- Category sitemap lastmod uses the newest published member and remains stable across repeated requests; Task 6 tests this.
- A catalog row with an unknown category, duplicate related slug, missing target or self-link is rejected before database writes; Task 2 tests each case.
- The largest 18-article CRM category remains fully linked in SSR and does not inherit the six-card blog pagination; Task 4 tests this.
- Category navigation and related cards wrap without horizontal overflow at 390 px; Task 6 verifies this in the browser.

---

## File Structure

- Create `src/lib/blogCategories.ts`: the only category slug union, category copy and URL helpers.
- Create `src/lib/blogCategories.test.ts`: config uniqueness and completeness tests.
- Create `src/components/BlogCard.tsx`: reusable article card rendering shared by the blog, category pages and related section.
- Create `src/components/BlogCategoryNav.tsx`: six category links and published counts.
- Create `src/routes/blog-category.tsx`: category loader, metadata and public route component.
- Create `src/routes/blog-category.test.tsx`: pure category selection and 404 behavior tests.
- Modify `public/content/blog.ru.json`: add approved category and relation map to all 46 Russian records.
- Modify `src/server/content/types.ts`: accept the new article payload fields.
- Modify `src/server/content/articleSources.ts`: validate and synchronize taxonomy.
- Modify `src/server/content/articleSources.test.ts`: taxonomy failure and success cases.
- Modify `scripts/migrate-content-to-postgres.ts`: preserve taxonomy during clean imports used by runtime tests.
- Modify `tests/migration/contentMigration.test.ts`: prove the legacy import copies category and curated relations.
- Modify `src/server/content/presentation.ts`: expose category and related slugs in article presentations/cards.
- Modify `src/components/Blog.tsx` and `src/components/Blog.test.tsx`: render category navigation and support an unpaginated category mode.
- Modify `src/routes/blog-index.tsx`: pass category counts into the public blog.
- Modify `src/routes.ts`: register the category route.
- Modify `src/routes/blog-post.tsx`: resolve category and published related article cards.
- Modify `src/pages/BlogPostPage.tsx` and `src/pages/BlogPostPage.test.tsx`: render category breadcrumb and related cards.
- Modify `src/server/seo/sitemaps.ts` and `tests/seo/sitemaps.test.ts`: include category URLs and lastmod; keep the existing sitemap route query unchanged.
- Modify `tests/seo/crawler.test.ts`: require six working indexable category pages in the live runtime crawl.

---

### Task 1: Typed category configuration

**Files:**
- Create: `src/lib/blogCategories.ts`
- Create: `src/lib/blogCategories.test.ts`

**Interfaces:**
- Produces: `BLOG_CATEGORY_SLUGS`, `BlogCategorySlug`, `BlogCategoryDefinition`, `BLOG_CATEGORIES`, `isBlogCategorySlug(value)`, `getBlogCategory(value)`, and `blogCategoryPath(slug)`.
- Consumed by: article validation, blog/category routes, UI navigation, article breadcrumbs and sitemap generation.

- [ ] **Step 1: Write the failing configuration test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOG_CATEGORIES,
  BLOG_CATEGORY_SLUGS,
  blogCategoryPath,
  getBlogCategory,
  isBlogCategorySlug,
} from "./blogCategories";

test("blog categories expose six unique complete indexable definitions", () => {
  assert.equal(BLOG_CATEGORIES.length, 6);
  assert.equal(new Set(BLOG_CATEGORY_SLUGS).size, 6);
  for (const category of BLOG_CATEGORIES) {
    assert.equal(getBlogCategory(category.slug), category);
    assert.equal(isBlogCategorySlug(category.slug), true);
    assert.equal(blogCategoryPath(category.slug), `/blog/category/${category.slug}/`);
    assert.ok(category.h1.length > 5);
    assert.ok(category.seoTitle.length > 20);
    assert.ok(category.seoDescription.length >= 100);
    assert.ok(category.intro.length >= 100);
    assert.match(category.serviceHref, /^\/services\/[a-z0-9-]+\/$/);
  }
  assert.equal(isBlogCategorySlug("unknown"), false);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `yarn tsx --test src/lib/blogCategories.test.ts`

Expected: FAIL because `./blogCategories` does not exist.

- [ ] **Step 3: Implement the typed configuration**

```ts
export const BLOG_CATEGORY_SLUGS = [
  "business-automation",
  "crm-sales",
  "digital-products",
  "technical-support",
  "ai-for-business",
  "it-project-management",
] as const;

export type BlogCategorySlug = typeof BLOG_CATEGORY_SLUGS[number];
export type BlogCategoryDefinition = {
  slug: BlogCategorySlug;
  title: string;
  h1: string;
  seoTitle: string;
  seoDescription: string;
  intro: string;
  serviceHref: string;
  serviceLabel: string;
};

export const BLOG_CATEGORIES: readonly BlogCategoryDefinition[] = [
  {
    slug: "business-automation",
    title: "Автоматизация бизнеса",
    h1: "Автоматизация бизнеса",
    seoTitle: "Автоматизация бизнеса: процессы, интеграции и практические руководства",
    seoDescription: "Статьи KorDevTeam об описании и автоматизации бизнес-процессов, интеграциях, рассылках, калькуляторах и выборе между готовым решением и разработкой.",
    intro: "Практические материалы о том, как находить подходящие процессы для автоматизации, описывать текущую работу, выбирать инструменты и внедрять решения без лишней сложности.",
    serviceHref: "/services/business-process-automation/",
    serviceLabel: "Автоматизация бизнес-процессов",
  },
  {
    slug: "crm-sales",
    title: "CRM и управление продажами",
    h1: "CRM и управление продажами",
    seoTitle: "CRM и продажи: внедрение, воронки и клиентская база",
    seoDescription: "Руководства KorDevTeam по внедрению CRM, воронкам продаж, работе с клиентской базой, коммуникациям, повторным продажам и развитию Krasotula CRM.",
    intro: "Материалы о том, как связать заявки, переписки, задачи, сделки и повторные касания в одной управляемой системе.",
    serviceHref: "/services/crm-development/",
    serviceLabel: "Разработка и внедрение CRM",
  },
  {
    slug: "digital-products",
    title: "Разработка цифровых продуктов",
    h1: "Разработка цифровых продуктов",
    seoTitle: "Разработка цифровых продуктов: веб-сервисы, приложения и API",
    seoDescription: "Статьи KorDevTeam о разработке веб-сервисов, мобильных приложений, API, EdTech-платформ и продуктов со сложной бизнес-логикой.",
    intro: "Технические и продуктовые разборы архитектуры, пользовательских сценариев, интеграций и эксплуатации цифровых сервисов.",
    serviceHref: "/services/web-services/",
    serviceLabel: "Разработка веб-сервисов",
  },
  {
    slug: "technical-support",
    title: "Техническая поддержка сайтов",
    h1: "Техническая поддержка сайтов",
    seoTitle: "Техническая поддержка сайтов: диагностика и сопровождение",
    seoDescription: "Практические статьи KorDevTeam о поддержке сайтов, WordPress, доменах, DNS, доступности, учёте задач и безопасном сопровождении.",
    intro: "Инструкции по диагностике сбоев, управлению доменами, ускорению сайтов и организации прозрачной работы технической команды.",
    serviceHref: "/services/additional-service/",
    serviceLabel: "Техническая поддержка сайтов",
  },
  {
    slug: "ai-for-business",
    title: "ИИ для бизнеса",
    h1: "ИИ для бизнеса",
    seoTitle: "ИИ для бизнеса: выбор задачи, внедрение и аудит",
    seoDescription: "Статьи KorDevTeam о выборе задач для ИИ, безопасном внедрении, техническом аудите AI-автоматизаций и передаче диалога человеку.",
    intro: "Материалы о применении ИИ и чат-ботов без магических обещаний: от постановки задачи и пилота до контроля качества, безопасности и стоимости эксплуатации.",
    serviceHref: "/services/ai-automation/",
    serviceLabel: "ИИ-автоматизация",
  },
  {
    slug: "it-project-management",
    title: "Управление IT-проектами",
    h1: "Управление IT-проектами",
    seoTitle: "Управление IT-проектами: консалтинг, команда и переговоры",
    seoDescription: "Статьи KorDevTeam об IT-консалтинге, переговорах, планировании продукта, управлении задачами и работе с государственными заказчиками.",
    intro: "Практика подготовки решений, согласования требований, управления командой и контроля разработки на протяжении всего проекта.",
    serviceHref: "/services/additional-service/",
    serviceLabel: "IT-консалтинг и сопровождение",
  },
];

export function isBlogCategorySlug(value: unknown): value is BlogCategorySlug {
  return typeof value === "string" && BLOG_CATEGORY_SLUGS.includes(value as BlogCategorySlug);
}

export const getBlogCategory = (value: unknown) =>
  BLOG_CATEGORIES.find(category => category.slug === value);

export const blogCategoryPath = (slug: BlogCategorySlug) =>
  `/blog/category/${slug}/`;
```

- [ ] **Step 4: Run the category test**

Run: `yarn tsx --test src/lib/blogCategories.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the category domain**

```bash
git add src/lib/blogCategories.ts src/lib/blogCategories.test.ts
git commit -m "feat(blog): define curated article categories"
```

---

### Task 2: Catalog taxonomy, validation and synchronization

**Files:**
- Modify: `public/content/blog.ru.json`
- Modify: `src/server/content/types.ts`
- Modify: `src/server/content/articleSources.ts`
- Modify: `src/server/content/articleSources.test.ts`
- Modify: `scripts/migrate-content-to-postgres.ts`
- Modify: `tests/migration/contentMigration.test.ts`

**Interfaces:**
- Consumes: `BLOG_CATEGORY_SLUGS`, `BlogCategorySlug`.
- Produces: `ArticleSource.payload.category: BlogCategorySlug` and `ArticleSource.payload.relatedArticleSlugs: string[]`.
- Database contract: the new values are stored only in the existing JSONB payload.

- [ ] **Step 1: Add failing taxonomy tests**

Extend the valid fixture with:

```ts
category: "business-automation",
relatedArticleSlugs: ["related-one", "related-two", "related-three"],
```

Add catalog rows for the three targets and assert:

```ts
assert.equal(source.payload.category, "business-automation");
assert.deepEqual(source.payload.relatedArticleSlugs, ["related-one", "related-two", "related-three"]);
```

Add separate rejection tests for:

```ts
{ category: "unknown", relatedArticleSlugs: ["related-one", "related-two", "related-three"] }
{ category: "business-automation", relatedArticleSlugs: ["process-description", "related-two", "related-three"] }
{ category: "business-automation", relatedArticleSlugs: ["related-one", "related-one", "related-three"] }
{ category: "business-automation", relatedArticleSlugs: ["related-one", "missing", "related-three"] }
```

Each case must reject with `article_source_invalid`.

Build the valid test catalog from six metadata rows, at least one per approved category, with three valid cross-links per row. Add one more rejection test that removes the only row for one category, proving the full catalog cannot leave an approved category empty.

In `tests/migration/contentMigration.test.ts`, extend one article fixture with the same two fields and assert the matching migration record contains them in `record.command.payload`.

- [ ] **Step 2: Run the source and migration tests**

Run:

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/content/articleSources.test.ts tests/migration/contentMigration.test.ts
```

Expected: FAIL because the new fields are neither validated nor persisted.

- [ ] **Step 3: Extend schemas and loader validation**

In `src/server/content/types.ts` extend the article payload:

```ts
category: z.enum(BLOG_CATEGORY_SLUGS).optional(),
relatedArticleSlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).length(3).optional(),
```

In `src/server/content/articleSources.ts`, require the two taxonomy fields in `articleCatalogItem` so every Russian row is checked even when only one article body is being synchronized. Keep the remaining editorial fields in `articleMetadata` so they are still required only for requested rows. Validate taxonomy against the entire Russian catalog:

```ts
const catalogSlugs = new Set(metadata.map(item => item.slug));
for (const item of metadata) {
  const related = item.relatedArticleSlugs;
  if (
    related.includes(item.slug)
    || new Set(related).size !== related.length
    || related.some(target => !catalogSlugs.has(target))
  ) throw new Error("article_source_invalid");
}
for (const category of BLOG_CATEGORY_SLUGS) {
  if (!metadata.some(item => item.category === category)) throw new Error("article_source_invalid");
}
```

Copy both fields into `source.payload`. In `scripts/migrate-content-to-postgres.ts`, copy `row.category` and `row.relatedArticleSlugs` into the article payload so clean test imports and production imports retain the taxonomy.

- [ ] **Step 4: Add the approved map to all 46 catalog records**

For every Russian record in `public/content/blog.ru.json`, add the exact category and three related slugs from the spec. Run this structural assertion:

```bash
node - <<'NODE'
const rows = require("./public/content/blog.ru.json").filter(x => !x.lang || x.lang === "ru");
if (rows.length !== 46) throw new Error(`expected 46 articles, got ${rows.length}`);
for (const row of rows) {
  if (!row.category) throw new Error(`${row.slug}: category missing`);
  if (!Array.isArray(row.relatedArticleSlugs) || row.relatedArticleSlugs.length !== 3) {
    throw new Error(`${row.slug}: invalid relations`);
  }
}
console.log("ARTICLE_TAXONOMY_OK");
NODE
```

Expected: `ARTICLE_TAXONOMY_OK`.

- [ ] **Step 5: Run tests and commit**

Run the Step 2 command again. Expected: PASS.

```bash
git add public/content/blog.ru.json src/server/content/articleSources.ts src/server/content/articleSources.test.ts scripts/migrate-content-to-postgres.ts tests/migration/contentMigration.test.ts
git add -p src/server/content/types.ts
git commit -m "feat(blog): validate article taxonomy"
```

---

### Task 3: Reusable blog cards and category navigation

**Files:**
- Create: `src/components/BlogCard.tsx`
- Create: `src/components/BlogCategoryNav.tsx`
- Modify: `src/components/Blog.tsx`
- Modify: `src/components/Blog.test.tsx`
- Modify: `src/server/content/presentation.ts`
- Modify: `src/routes/blog-index.tsx`

**Interfaces:**
- Produces: `BlogPostCardView` with `category`, `BlogCard({ post, fallbackSrc })`, and `BlogCategoryNav({ counts })`.
- `Blog` gains `mode: "preview" | "index" | "category"`, optional heading copy, and an optional service link.
- Category mode renders every supplied post; only index mode reads or writes the page query.

- [ ] **Step 1: Add failing SSR tests**

In `src/components/Blog.test.tsx`, add category to fixtures and assert:

```ts
test("blog index exposes every category as an SSR link with counts", () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/blog/">
      <Blog mode="index" posts={postsAcrossSixCategories} />
    </StaticRouter>,
  );
  const document = new JSDOM(markup).window.document;
  assert.equal(document.querySelectorAll('nav[aria-label="Категории блога"] a').length, 6);
  assert.equal(document.querySelector('a[href="/blog/category/crm-sales/"] [data-category-count]')?.textContent, "1");
});

test("category mode renders all supplied articles without pagination", () => {
  const posts = Array.from({ length: 18 }, (_, index) => articleFixture(index));
  const markup = renderToStaticMarkup(
    <StaticRouter location="/blog/category/crm-sales/">
      <Blog mode="category" posts={posts} heading={categoryHeading} />
    </StaticRouter>,
  );
  const document = new JSDOM(markup).window.document;
  assert.equal(document.querySelectorAll('article[itemtype="https://schema.org/BlogPosting"]').length, 18);
  assert.equal(document.querySelector('[aria-label="Пагинация"]'), null);
});
```

- [ ] **Step 2: Run the component test**

Run: `yarn tsx --test src/components/Blog.test.tsx`

Expected: FAIL because Blog has no category navigation or category mode.

- [ ] **Step 3: Extract and reuse BlogCard**

Move `BlogPost`, media normalization and the existing ContentCard assembly from `Blog.tsx` into `BlogCard.tsx`. Keep the current images, date, read time, microdata and canonical output unchanged.

Extend the card view:

```ts
export type BlogPostCardView = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  category: BlogCategorySlug | null;
  coverUrl?: string;
  imageUrls?: string[];
};
```

Update `articlePresentation` and `articleCard` to expose a category only when `isBlogCategorySlug(entry.payload.category)` succeeds; otherwise expose `null`. Production catalog validation guarantees a value, while the nullable presentation keeps stale or hand-authored database rows from crashing the blog index.

- [ ] **Step 4: Implement category navigation and category mode**

`BlogCategoryNav` derives six links from `BLOG_CATEGORIES` and receives a `Partial<Record<BlogCategorySlug, number>>`. The blog index route passes article cards; `Blog` computes counts and renders navigation only in index mode. Category mode uses all posts and supplied heading copy.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
yarn tsx --test src/components/Blog.test.tsx
yarn typecheck
```

Expected: PASS.

```bash
git add src/components/BlogCard.tsx src/components/BlogCategoryNav.tsx src/components/Blog.tsx src/components/Blog.test.tsx src/server/content/presentation.ts src/routes/blog-index.tsx
git commit -m "feat(blog): add category navigation"
```

---

### Task 4: Indexable category route

**Files:**
- Create: `src/routes/blog-category.tsx`
- Create: `src/routes/blog-category.test.tsx`
- Modify: `src/routes.ts`

**Interfaces:**
- Produces: `selectPublishedCategory(categorySlug, entries)` and React Router `loader`.
- Loader output: `{ seo, category, posts }`.
- 404 responses use `documentHeaders`.

- [ ] **Step 1: Write failing category selection tests**

```ts
test("category selection returns every published CRM article", () => {
  const result = selectPublishedCategory("crm-sales", entriesWithEighteenCrmArticles);
  assert.equal(result?.entries.length, 18);
  assert.equal(result?.category.slug, "crm-sales");
});

test("unknown and empty categories resolve to null", () => {
  assert.equal(selectPublishedCategory("unknown", entries), null);
  assert.equal(selectPublishedCategory("ai-for-business", entriesWithoutAi), null);
});
```

- [ ] **Step 2: Run the route test**

Run: `yarn tsx --test src/routes/blog-category.test.tsx`

Expected: FAIL because the route module does not exist.

- [ ] **Step 3: Implement the route**

Register the specific category route before the dynamic article route:

```ts
route("blog/category/:category/", "routes/blog-category.tsx")
```

The loader must:

```ts
const definition = getBlogCategory(params.category);
if (!definition) throw new Response(null, { status: 404, headers: documentHeaders });
const entries = (await listPublishedEntries("article"))
  .filter(entry => entry.payload.category === definition.slug);
if (!entries.length) throw new Response(null, { status: 404, headers: documentHeaders });
const media = await getEntryMediaMaps(entries.map(entry => entry.id));
return data({
  seo: {
    pathname: blogCategoryPath(definition.slug),
    title: definition.seoTitle,
    description: definition.seoDescription,
    indexable: true,
    kind: "page",
  },
  category: definition,
  posts: entries.map(entry => articleCard(entry, media[entry.id])),
}, { headers: documentHeaders });
```

Render breadcrumbs, H1/intro and the profile service link through category-mode `Blog`.

- [ ] **Step 4: Run route and component tests**

Run:

```bash
yarn tsx --test src/routes/blog-category.test.tsx src/components/Blog.test.tsx
yarn typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the category route**

```bash
git add src/routes.ts src/routes/blog-category.tsx src/routes/blog-category.test.tsx
git commit -m "feat(blog): add indexable category pages"
```

---

### Task 5: Article breadcrumbs and curated related cards

**Files:**
- Modify: `src/routes/blog-post.tsx`
- Modify: `src/pages/BlogPostPage.tsx`
- Modify: `src/pages/BlogPostPage.test.tsx`
- Modify: `src/server/content/presentation.ts`

**Interfaces:**
- Consumes: article payload category and relatedArticleSlugs from Task 2; `BlogCard` from Task 3.
- Produces: `BlogPostPage({ article, category, relatedArticles })`.
- Related entries are ordered by the source article's curated slug array.

- [ ] **Step 1: Write failing article-page tests**

Add fixtures with one category and three related cards:

```ts
assert.equal(document.querySelector('nav[aria-label="Хлебные крошки"] a[href="/blog/"]')?.textContent, "Блог");
assert.equal(document.querySelector('nav[aria-label="Хлебные крошки"] a[href="/blog/category/business-automation/"]')?.textContent, "Автоматизация бизнеса");
assert.deepEqual(
  [...document.querySelectorAll('section[aria-labelledby="related-articles-title"] article a')]
    .map(link => link.getAttribute("href")),
  ["/blog/related-one/", "/blog/related-two/", "/blog/related-three/"],
);
```

Add a second test where one related entry is unpublished/absent and assert the other two render in the original order.

- [ ] **Step 2: Run the article-page tests**

Run: `yarn tsx --test src/pages/BlogPostPage.test.tsx`

Expected: FAIL because the page has no category or related section.

- [ ] **Step 3: Resolve published related entries in the loader**

In `src/routes/blog-post.tsx`:

```ts
const relatedSlugs = article.payload.relatedArticleSlugs as string[];
const allArticles = await listPublishedEntries("article");
const bySlug = new Map(allArticles.map(candidate => [candidate.slug, candidate]));
const relatedEntries = relatedSlugs.map(slug => bySlug.get(slug)).filter(Boolean);
const relatedMedia = await getEntryMediaMaps(relatedEntries.map(entry => entry.id));
const relatedArticles = relatedEntries.map(entry => articleCard(entry, relatedMedia[entry.id]));
```

Resolve the category through `getBlogCategory(article.payload.category)`. Because publication validation guarantees the category for synchronized sources, a missing runtime definition must produce a safe 404 rather than render an invalid breadcrumb.

- [ ] **Step 4: Render breadcrumb and related cards**

Replace the single back control above the article with a semantic breadcrumb containing the blog and category links. Render a full-width «Читайте также» section after the article/author grid and before the final back button. Use `BlogCard` so cards retain the same image, date, time and microdata as the blog index.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
yarn tsx --test src/pages/BlogPostPage.test.tsx src/components/Blog.test.tsx
yarn typecheck
```

Expected: PASS.

```bash
git add src/routes/blog-post.tsx src/pages/BlogPostPage.tsx src/pages/BlogPostPage.test.tsx src/server/content/presentation.ts
git commit -m "feat(blog): add curated related articles"
```

---

### Task 6: Sitemap, database synchronization and end-to-end verification

**Files:**
- Modify: `src/server/seo/sitemaps.ts`
- Modify: `tests/seo/sitemaps.test.ts`
- Modify: `tests/seo/crawler.test.ts`
- Update generated database records through existing sync command; do not commit database state.

**Interfaces:**
- `buildBlogSitemap(entries)` continues to accept published content entries but now emits article and non-empty category URLs.
- Category lastmod is the maximum `updatedAt` among published indexable member articles.

- [ ] **Step 1: Add failing sitemap and live-runtime assertions**

In `tests/seo/sitemaps.test.ts`, assert a fixture category:

```ts
const sitemap = buildBlogSitemap([olderCrmArticle, newerCrmArticle, aiArticle]);
assert.match(sitemap, /https:\/\/kordev\.team\/blog\/category\/crm-sales\//);
assert.match(sitemap, new RegExp(newerCrmArticle.updatedAt.toISOString()));
assert.equal((sitemap.match(/\/blog\/category\/crm-sales\//g) ?? []).length, 1);
```

In `tests/seo/crawler.test.ts`, require all six category URLs in the blog sitemap and assert each returns 200, one visible H1, index/follow, self-canonical and at least one article link. Fetch the sitemap twice and assert category lastmod values do not change.

- [ ] **Step 2: Run sitemap tests**

Run:

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 tests/seo/sitemaps.test.ts tests/seo/crawler.test.ts
```

Expected: FAIL because category URLs are absent.

- [ ] **Step 3: Implement category sitemap records**

Group published, indexable articles whose payload category is valid. For every non-empty group, emit:

```ts
{
  loc: canonicalUrl({ pathname: blogCategoryPath(category.slug) }),
  lastmod: group.reduce(
    (latest, entry) => entry.updatedAt > latest ? entry.updatedAt : latest,
    group[0].updatedAt,
  ).toISOString(),
}
```

Pass the same published entries already loaded by `sitemap-blog.xml.ts`; no new database query is needed.

- [ ] **Step 4: Synchronize all 46 article payloads and verify idempotency**

Run:

```bash
for slug in $(jq -r '.[] | select(.lang == null or .lang == "ru") | .slug' public/content/blog.ru.json); do
  DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn content:articles --slug "$slug" || exit 1
done
```

Run the same loop a second time. Expected for every second-run record:

```json
{"ok":true,"articles":{"updated":0,"unchanged":1}}
```

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/lib/blogCategories.test.ts src/server/content/articleSources.test.ts src/components/Blog.test.tsx src/routes/blog-category.test.tsx src/pages/BlogPostPage.test.tsx tests/seo/sitemaps.test.ts tests/seo/crawler.test.ts
yarn typecheck
yarn build
git diff --check
```

Expected: all tests pass; typecheck and production build exit 0; diff check is clean.

Use the in-app browser to inspect:

- /blog/
- /blog/category/crm-sales/
- /blog/category/ai-for-business/
- /blog/government-contractors-guide/

At 1280×900 and 390×844 assert:

```js
({
  h1Count: document.querySelectorAll("h1").length,
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
  brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0).length,
})
```

Expected: `h1Count === 1`, `clientWidth === scrollWidth`, `brokenImages === 0`.

- [ ] **Step 6: Commit sitemap and final integration**

```bash
git add src/server/seo/sitemaps.ts tests/seo/sitemaps.test.ts tests/seo/crawler.test.ts
git commit -m "feat(seo): publish blog category hubs"
```

Finally verify `git status --short` contains only the unrelated pre-existing files and open `/blog/category/crm-sales/` as the user-facing deliverable.
