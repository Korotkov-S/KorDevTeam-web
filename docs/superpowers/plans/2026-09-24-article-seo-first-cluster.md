# Article SEO First Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать проверяемую SEO-карту всех 46 статей и переработать существующую статью об описании бизнес-процессов на прежнем URL с безопасной синхронизацией исходника в PostgreSQL.

**Architecture:** Markdown-файлы `public/blog/*.md` остаются источником основного текста, а `public/content/blog.ru.json` — источником метаданных. Новый узкий синхронизатор загружает только явно переданные существующие slugs, сохраняет `publishedAt`, записывает ревизию и не трогает связи или остальные статьи. SEO-аудит и бриф хранятся в `docs/seo`, а проверки источника фиксируют интент, структуру и внутренние ссылки.

**Tech Stack:** TypeScript, Node.js test runner, Zod, Drizzle ORM, PostgreSQL, React Router SSR, Markdown, Яндекс Wordstat, Яндекс и Google Search.

**Spec:** `docs/superpowers/specs/2026-09-24-article-seo-program-design.md`

## Global Constraints

- URL `/blog/business-processes-before-automation/` сохраняется.
- Страница услуги владеет коммерческим интентом; статья отвечает на информационный запрос.
- Новые статьи не создаются до проверки существующих URL.
- Wordstat фиксируется с регионом, устройствами, периодом и типом соответствия.
- Конкурентные тексты не копируются; статья строится на собственном опыте.
- Плотность ключевых слов не задаётся.
- Синхронизация изменяет только явно указанные существующие статьи и не меняет связи.
- Посторонние пользовательские правки в рабочем дереве сохраняются.

## Review Focus

- Неизвестный slug завершается ошибкой до записи в БД.
- Повторный запуск даёт `unchanged: 1` и не создаёт ревизию.
- Конкурентное изменение приводит к `article_source_version_conflict`.
- `publishedAt`, relations и media refs не меняются.
- Карта аудита содержит каждый slug из источника ровно один раз.

---

### Task 1: Создать проверяемую карту 46 статей

**Files:**
- Create: `docs/seo/article-audit-2026-09.md`
- Read: `public/content/blog.ru.json`
- Read: `public/blog/*.md`
- Read: `docs/seo/semantic-research-2026-09.md`

**Interfaces:**
- Consumes: 46 опубликованных записей и соответствующие Markdown-файлы.
- Produces: таблицу с решениями `обновить`, `сохранить`, `объединить`, `новость`, `noindex` или `создать`.

- [ ] **Step 1: Создать формат карты**

Использовать колонки:

```markdown
| Slug | Текущий заголовок | Кластер | Интент | Основной запрос | Wordstat | Связанная услуга | Решение | Приоритет | Комментарий |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

- [ ] **Step 2: Выгрузить исходный инвентарь**

Run:

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('public/content/blog.ru.json', 'utf8'));
for (const item of rows) {
  const body = fs.readFileSync('public/blog/' + item.slug + '.md', 'utf8');
  console.log([item.slug, item.title, body.length, item.tags.join(', ')].join('\t'));
}
NODE
```

Expected: 46 строк, все Markdown-файлы читаются.

- [ ] **Step 3: Классифицировать URL**

Для каждого slug заполнить кластер, интент, связанную услугу, предварительное решение и приоритет. Непроверенную частотность отмечать `исследовать`. Короткие новости «Красотули» отделить от поисковых руководств.

- [ ] **Step 4: Проверить полноту**

Run:

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const expected = JSON.parse(fs.readFileSync('public/content/blog.ru.json', 'utf8')).map(x => x.slug).sort();
const audit = fs.readFileSync('docs/seo/article-audit-2026-09.md', 'utf8');
const actual = [...audit.matchAll(/^\| \x60([^\x60]+)\x60 \|/gm)].map(x => x[1]).sort();
if (actual.length !== 46 || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('article audit mismatch');
console.log('article audit: 46/46');
NODE
```

Expected: `article audit: 46/46`.

- [ ] **Step 5: Проверить и зафиксировать документ**

Run:

```bash
! rg -n 'T(BD)|T(ODO)|PLACE(HOLDER)' docs/seo/article-audit-2026-09.md
git diff --check -- docs/seo/article-audit-2026-09.md
```

Commit:

```bash
git add docs/seo/article-audit-2026-09.md
git commit -m "docs(seo): audit published articles"
```

### Task 2: Добавить безопасную синхронизацию выбранных статей

**Files:**
- Create: `src/server/content/articleSources.ts`
- Create: `src/server/content/articleSources.test.ts`
- Create: `scripts/sync-articles.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadArticleSources(slugs: readonly string[], root?: string): Promise<ArticleSource[]>`.
- Produces: `applyArticleSources(db: ContentDatabase, sources: readonly ArticleSource[]): Promise<{ updated: number; unchanged: number }>`.
- Produces: `yarn content:articles --slug <slug>`.

- [ ] **Step 1: Написать падающие тесты загрузчика**

Тестовая fixture содержит один metadata record и один Markdown. Проверить объединение title, SEO-полей, body, tags и cover. Добавить тесты кодов `article_source_unknown_slug`, `article_source_duplicate_slug`, `article_source_markdown_missing` и `article_source_invalid`.

- [ ] **Step 2: Подтвердить RED**

Run:

```bash
yarn tsx --test src/server/content/articleSources.test.ts
```

Expected: FAIL, модуль отсутствует.

- [ ] **Step 3: Реализовать загрузчик**

Определить:

```ts
export type ArticleSource = {
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  seoTitle: string;
  seoDescription: string;
  payload: {
    h1: string;
    author: string;
    tags: string[];
    coverUrl: string;
    imageUrls: string[];
    readTime: string;
  };
};

export async function loadArticleSources(
  slugs: readonly string[],
  root = process.cwd(),
): Promise<ArticleSource[]>;
```

Загрузчик требует непустой уникальный список slug, читает `public/content/blog.ru.json` и соответствующие Markdown, проверяет совпадение H1 и title, формирует `author: "Геннадий Коротков"` и валидирует результат через `parseContentCommand` и `validatePublication`.

- [ ] **Step 4: Написать падающие тесты применения**

На тестовой PostgreSQL-базе проверить:

- меняется только запрошенная статья;
- `publishedAt` сохраняется;
- version увеличивается на 1;
- создаётся одна revision;
- relations и media refs не меняются;
- второй запуск возвращает `unchanged: 1`;
- отсутствующая цель даёт `article_source_target_missing`;
- конфликт version даёт `article_source_version_conflict`.

- [ ] **Step 5: Реализовать атомарное применение**

`applyArticleSources` использует `pg_advisory_xact_lock(706007)`, блокирует только запрошенные article rows, сравнивает поля через `checksum`, сохраняет snapshot в `contentRevisions` и обновляет title, excerpt, bodyMd, seoTitle, seoDescription и payload. Insert запрещён. Status, `publishedAt`, canonical, indexable, relations и media refs сохраняются.

- [ ] **Step 6: Реализовать CLI**

`scripts/sync-articles.ts` принимает только повторяемый `--slug`. Пустой или неизвестный аргумент даёт `article_sync_invalid_arguments`. Добавить:

```json
"content:articles": "tsx scripts/sync-articles.ts"
```

Успех выводится безопасным JSON:

```json
{"ok":true,"articles":{"updated":1,"unchanged":0}}
```

- [ ] **Step 7: Проверить**

Run:

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test src/server/content/articleSources.test.ts
yarn typecheck
```

Expected: tests PASS, typecheck exit 0.

- [ ] **Step 8: Зафиксировать**

```bash
git add src/server/content/articleSources.ts src/server/content/articleSources.test.ts scripts/sync-articles.ts package.json
git commit -m "feat(content): sync curated article sources"
```

### Task 3: Исследовать и переписать первую статью

**Files:**
- Create: `docs/seo/briefs/business-process-description.md`
- Modify: `public/blog/business-processes-before-automation.md`
- Modify: `public/content/blog.ru.json`
- Create: `tests/seo/articleSource.test.ts`

**Interfaces:**
- Consumes: Wordstat, российскую выдачу Яндекса и Google, спецификацию и опыт KorDevTeam.
- Produces: один URL с интентом «как описать бизнес-процесс перед автоматизацией».

- [ ] **Step 1: Заполнить Wordstat-бриф**

Зафиксировать Россию, все устройства, период 23.08.2026–21.09.2026, широкое значение 3 628, фразовое 96, а также план 522, пример 190, BPMN 180 и структуру 173. Отделить курсы, вакансии, учебные задания и бизнес-планы.

- [ ] **Step 2: Исследовать SERP**

Для запросов `описание бизнес процессов`, `как описать бизнес процесс пример` и `описание бизнес процессов BPMN` записать по пяти сильным российским результатам Яндекса и Google: URL, тип страницы, разделы, полезный элемент и пробел.

- [ ] **Step 3: Добавить собственный опыт в бриф**

Зафиксировать интервью, AS IS, роли, вход, результат, правила, исключения, ожидания, двойной ввод, TO BE, показатели, требования и матрицу ответственности. Не раскрывать клиентские данные и не придумывать метрики.

- [ ] **Step 4: Написать падающий source contract test**

Проверить exact title, seoTitle, meta description с AS IS/TO BE, обязательные headings и ссылки на `/services/business-process-automation/` и `/cases/teharmatura-automation/`.

- [ ] **Step 5: Подтвердить RED**

Run:

```bash
yarn tsx --test tests/seo/articleSource.test.ts
```

Expected: FAIL на старом title и отсутствующих разделах.

- [ ] **Step 6: Переписать Markdown**

Обязательная структура:

```markdown
# Описание бизнес-процессов: как подготовить процесс к автоматизации
## Что должно получиться в результате
## Как выбрать первый процесс для описания
## Что собрать до схемы
## Как описать бизнес-процесс AS IS
## Пример описания процесса обработки заявки
## Когда достаточно текста и таблицы
## Когда нужна BPMN
## Как найти потери в текущем процессе
## Как перейти от AS IS к TO BE
## Что передать команде разработки
## Типичные ошибки
## Чек-лист готовности процесса к автоматизации
## Что делать дальше
```

Пример оформить таблицей: шаг, участник, вход, действие, результат, система, срок, исключение. Сохранить полезную исходную мысль о том, что код усиливает порядок или беспорядок.

- [ ] **Step 7: Обновить metadata record**

Изменить только запись `business-processes-before-automation`:

```json
{
  "title": "Описание бизнес-процессов: как подготовить процесс к автоматизации",
  "seoTitle": "Описание бизнес-процессов перед автоматизацией: этапы и пример",
  "seoDescription": "Как описать бизнес-процесс AS IS, найти потери, спроектировать TO BE и подготовить требования к автоматизации: этапы, таблица и практический пример.",
  "excerpt": "Пошагово описываем бизнес-процесс AS IS, находим потери и готовим модель TO BE перед внедрением CRM, интеграции или заказной системы.",
  "updatedDate": "24 сентября 2026",
  "readTime": "9 мин"
}
```

Сохранить slug, date, coverUrl, imageUrls и tags. Alt-тексты изображений должны описывать конкретное изображение.

- [ ] **Step 8: Проверить content source**

Run:

```bash
yarn tsx --test tests/seo/articleSource.test.ts src/server/content/articleSources.test.ts
jq empty public/content/blog.ru.json
git diff --check -- public/blog/business-processes-before-automation.md public/content/blog.ru.json docs/seo/briefs/business-process-description.md
```

Expected: PASS.

- [ ] **Step 9: Зафиксировать статью**

```bash
git add docs/seo/briefs/business-process-description.md public/blog/business-processes-before-automation.md public/content/blog.ru.json tests/seo/articleSource.test.ts
git commit -m "content(blog): expand business process description guide"
```

### Task 4: Синхронизировать и проверить страницу

**Files:**
- Verify: runtime PostgreSQL article row
- Verify: `/blog/business-processes-before-automation/`

- [ ] **Step 1: Синхронизировать только выбранную статью**

Run:

```bash
DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn content:articles --slug business-processes-before-automation
```

Expected: `updated: 1`.

- [ ] **Step 2: Подтвердить идемпотентность**

Повторить команду. Expected: `unchanged: 1`.

- [ ] **Step 3: Запустить focused regression**

Run:

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test src/server/content/articleSources.test.ts tests/seo/articleSource.test.ts src/pages/BlogPostPage.test.tsx src/server/seo/metadata.test.ts
yarn typecheck
DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn build
```

Expected: tests PASS, typecheck и build exit 0.

- [ ] **Step 4: Проверить SSR**

Проверить в исходном HTML H1, AS IS, пример, чек-лист, canonical, BlogPosting, datePublished, dateModified и автора.

- [ ] **Step 5: Проверить визуально**

На desktop и 390 px проверить H1, таблицу без переполнения всей страницы, изображения, alt-тексты и ссылки на услугу/кейс.

- [ ] **Step 6: Запустить полный набор**

Run:

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn test
```

Expected: новые проверки проходят; посторонние падения перечисляются дословно.

- [ ] **Step 7: Финальная проверка**

Run:

```bash
git diff --check
git status --short
git log --oneline -4
```

- [ ] **Step 8: Подготовить итог**

Сообщить ссылки на карту и бриф, новый H1, Wordstat-показатели, неизменный URL и точные результаты всех проверок.
