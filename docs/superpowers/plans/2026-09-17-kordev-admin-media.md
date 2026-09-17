# Админка KorDevTeam и медиатека — план реализации

> **Для agentic workers:** ОБЯЗАТЕЛЬНЫЙ ПОДНАВЫК: использовать `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, выполняя план задача за задачей. Прогресс отмечается чекбоксами `- [ ]`.

**Цель:** заменить старую файловую админку защищённым SSR-редактором PostgreSQL и публичной медиатекой Timeweb S3 без автоматического переключения production.

**Архитектура:** React Router loaders/actions образуют HTTP-границу `/admin/*`, а отдельные server-only модули отвечают за авторизацию, редактирование контента и S3. Контентные изменения, связи, media references и ревизии фиксируются одной PostgreSQL-транзакцией с optimistic locking; S3 использует content-addressed объекты и компенсирующее удаление. Существующий публичный SSR продолжает читать только опубликованные записи.

**Стек:** React 18, React Router 7 Framework Mode, TypeScript 5.9, PostgreSQL 16, Drizzle ORM, Node.js 22, AWS SDK S3, Sharp, Zod, Node test runner, Testing Library, Puppeteer.

**Спецификация:** `docs/superpowers/specs/2026-09-17-kordev-admin-media-design.md`

## Общие ограничения

- Работа выполняется в текущей ветке `main` по ранее подтверждённому выбору владельца; push и production-переключение не выполняются.
- `/admin/*` использует только PostgreSQL и Timeweb S3; новый код не пишет в SQLite/SQL.js, Markdown/JSON или локальные uploads.
- Cookie сессии: `__Host-kordev_admin`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, срок 12 часов без sliding expiration.
- Пароли: 14–256 символов, scrypt `N=32768`, `r=8`, `p=1`, выход 64 байта, salt 32 байта, `maxmem=64 MiB`.
- Любое изменение существующего контента, настройки или media metadata требует ожидаемую версию; 409 никогда не перезаписывает более новую запись.
- Все admin-ответы получают `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, anti-framing CSP, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`.
- Изображения: только JPG/PNG/WebP, максимум 20 MiB и 40 MP; WebP-варианты 640/1280/1920 без увеличения.
- Реализация каждого поведения идёт TDD-циклом RED → GREEN → REFACTOR; production-код не пишется до подтверждённого падения соответствующего теста.
- После каждой задачи выполняются её целевые тесты и `yarn typecheck`; логически завершённые задачи фиксируются отдельными локальными коммитами.

---

### Задача 1. Добавочная схема PostgreSQL для админки

**Файлы:**

- Изменить: `src/server/db/schema.ts`
- Создать: `drizzle/0003_admin_media.sql` и соответствующий snapshot через Drizzle Kit
- Изменить: `src/server/db/schema.test.ts`
- Изменить: `src/server/db/testDatabase.test.ts`

**Интерфейсы:**

- Создаёт таблицы `admin_sessions`, `admin_auth_limits`, `content_media_refs`.
- Добавляет `media_assets.processingVersion`, `media_assets.version`, `media_assets.decorative`, `site_settings.version`.
- Экспортирует Drizzle objects `adminSessions`, `adminAuthLimits`, `contentMediaRefs` для последующих сервисов.

- [x] **Шаг 1: написать падающие проверки схемы**

```ts
test("admin schema exposes versioned sessions and media references", () => {
  assert.equal(adminSessions.expiresAt.notNull, true);
  assert.equal(adminAuthLimits.subjectHash.notNull, true);
  assert.equal(contentMediaRefs.mediaId.notNull, true);
  assert.equal(mediaAssets.version.notNull, true);
  assert.equal(siteSettings.version.notNull, true);
});
```

- [x] **Шаг 2: подтвердить RED**

Выполнить: `node --import tsx --test src/server/db/schema.test.ts`

Ожидается: импорт новых Drizzle objects или новых колонок отсутствует.

- [x] **Шаг 3: добавить enum, таблицы, индексы и constraints**

```ts
export const adminAuthLimitKind = pgEnum("admin_auth_limit_kind", ["ip", "login", "global"]);

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminUserId: uuid("admin_user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  csrfHash: varchar("csrf_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
```

Для `content_media_refs` использовать PK `(entry_id, media_id, field_path)`, `onDelete: cascade` для entry и `onDelete: restrict` для media. Для auth-limit использовать уникальность `(kind, subject_hash, window_started_at)` и индекс срока очистки. Добавить положительные check constraints для всех версий.

- [x] **Шаг 4: сгенерировать и проверить миграцию**

Выполнить: `yarn db:generate --name admin_media`

Переименовать сгенерированный SQL в следующий последовательный файл только если Drizzle выбрал другое безопасное имя; не редактировать старые миграции.

- [x] **Шаг 5: подтвердить GREEN на чистой тестовой БД**

Выполнить: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test node --import tsx --test src/server/db/schema.test.ts src/server/db/testDatabase.test.ts`

Ожидается: PASS, миграции поднимаются с нуля.

- [x] **Шаг 6: зафиксировать задачу**

```bash
git add src/server/db/schema.ts src/server/db/schema.test.ts src/server/db/testDatabase.test.ts drizzle
git commit -m "feat(admin): add session and media schema"
```

---

### Задача 2. Конфигурация, пароли, cookie и bootstrap администратора

**Файлы:**

- Создать: `src/server/auth/config.ts`
- Создать: `src/server/auth/password.ts`
- Создать: `src/server/auth/cookie.ts`
- Создать: `src/server/auth/config.test.ts`
- Создать: `src/server/auth/password.test.ts`
- Создать: `src/server/auth/cookie.test.ts`
- Создать: `scripts/create-admin.ts`
- Создать: `scripts/create-admin.test.ts`
- Изменить: `package.json`

**Интерфейсы:**

- `readAdminAuthConfig(env): AdminAuthConfig` читает base64 secrets длиной не менее 32 байт и доверенный origin.
- `hashPassword(password): Promise<{ digest: string; salt: string }>` и `verifyPassword(password, record): Promise<boolean>`.
- `createAdminCookie(token)` и `clearAdminCookie()` возвращают готовые `Set-Cookie` значения.
- CLI `yarn admin:create` читает логин и пароль через stdin/TTY и вызывает `createAdminUser(db, input)` без передачи пароля в argv.

- [x] **Шаг 1: написать падающие unit-тесты**

```ts
test("rejects a short admin password", async () => {
  await assert.rejects(() => hashPassword("short"), /admin_password_invalid/);
});

test("creates a host-only secure cookie", () => {
  const value = createAdminCookie("token");
  assert.match(value, /^__Host-kordev_admin=/);
  assert.match(value, /Secure; HttpOnly; SameSite=Strict; Path=\//);
  assert.doesNotMatch(value, /Domain=/);
});
```

- [x] **Шаг 2: подтвердить RED**

Выполнить: `node --import tsx --test src/server/auth/config.test.ts src/server/auth/password.test.ts src/server/auth/cookie.test.ts scripts/create-admin.test.ts`

Ожидается: новые модули отсутствуют.

- [x] **Шаг 3: реализовать строгую конфигурацию и криптографию**

```ts
export type AdminAuthConfig = {
  sessionHmacKey: Buffer;
  rateLimitHmacKey: Buffer;
  trustedOrigin: URL;
  sessionTtlMs: 43_200_000;
};
```

Использовать `node:crypto` `randomBytes`, `scrypt`/`promisify`, `timingSafeEqual`. Digest и salt хранить base64; malformed record возвращает `false`, не раскрывая причину.

- [x] **Шаг 4: реализовать bootstrap без argv-секрета**

```json
{
  "scripts": {
    "admin:create": "tsx scripts/create-admin.ts"
  }
}
```

CLI отказывает в пустом логине, дубликате и неинтерактивном запуске без безопасного stdin. Логи не содержат пароль или digest.

- [x] **Шаг 5: подтвердить GREEN и отсутствие секретов в выводе**

Выполнить: `node --import tsx --test src/server/auth/config.test.ts src/server/auth/password.test.ts src/server/auth/cookie.test.ts scripts/create-admin.test.ts`

Ожидается: PASS.

- [x] **Шаг 6: зафиксировать задачу**

```bash
git add src/server/auth scripts/create-admin.ts scripts/create-admin.test.ts package.json
git commit -m "feat(admin): add secure credential bootstrap"
```

---

### Задача 3. Репозиторий сессий, login rate limit и CSRF

**Файлы:**

- Создать: `src/server/auth/repository.ts`
- Создать: `src/server/auth/service.ts`
- Создать: `src/server/auth/request.ts`
- Создать: `src/server/auth/repository.test.ts`
- Создать: `src/server/auth/service.test.ts`
- Создать: `src/server/auth/request.test.ts`

**Интерфейсы:**

- `createAuthRepository(db)` управляет пользователями, sessions и auth-limit buckets.
- `createAuthService(db, config, clock?)` предоставляет `login`, `authenticate`, `logout`, `changePassword`, `csrfToken`.
- `requireAdmin(request): Promise<AdminPrincipal>` и `requireAdminMutation(request, formData): Promise<AdminPrincipal>` образуют route guard.

- [x] **Шаг 1: написать падающие тесты с PostgreSQL**

```ts
test("session expires exactly twelve hours after login", async () => {
  const login = await service.login({ login: "owner", password: validPassword, ip: "203.0.113.5" });
  clock.advance(43_200_001);
  assert.equal(await service.authenticate(login.token), null);
});

test("a csrf mismatch rejects mutation", async () => {
  await assert.rejects(
    () => verifyMutationRequest(request, session, "wrong"),
    /admin_csrf_invalid/,
  );
});
```

- [x] **Шаг 2: подтвердить RED**

Выполнить: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test node --import tsx --test src/server/auth/repository.test.ts src/server/auth/service.test.ts src/server/auth/request.test.ts`

Ожидается: новые сервисы отсутствуют.

- [x] **Шаг 3: реализовать session token и buckets**

Сырой token и CSRF token генерируются 32 случайными байтами. В БД сохраняется HMAC-SHA-256. Окна: 5 неудач/15 минут по IP и login, 50/15 минут global; cleanup удаляет максимум 500 истёкших строк. Ошибка входа всегда `admin_login_invalid`.

- [x] **Шаг 4: реализовать request guards**

```ts
export type AdminPrincipal = {
  userId: string;
  login: string;
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
};
```

Mutation guard проверяет cookie, `Origin`, `Sec-Fetch-Site`, HTTP-метод и hidden `_csrf` либо `X-CSRF-Token`. Safe return path разрешает только нормализованные пути с префиксом `/admin/`.

- [x] **Шаг 5: подтвердить GREEN**

Выполнить целевой тест из шага 2; ожидается PASS без warning.

- [x] **Шаг 6: зафиксировать задачу**

```bash
git add src/server/auth
git commit -m "feat(admin): add database sessions and csrf guards"
```

---

### Задача 4. Защищённая SSR-ветка `/admin/` и вход

**Файлы:**

- Изменить: `src/routes.ts`
- Изменить: `src/root.tsx`
- Создать: `src/routes/admin/headers.ts`
- Создать: `src/routes/admin/layout.tsx`
- Создать: `src/routes/admin/login.tsx`
- Создать: `src/routes/admin/logout.tsx`
- Создать: `src/routes/admin/index.tsx`
- Создать: `src/routes/admin/routes.test.tsx`
- Изменить: `src/styles/index.css`

**Интерфейсы:**

- `adminHeaders()` возвращает единый набор security headers.
- Protected layout loader возвращает только `{ login, csrfToken, expiresAt }`.
- Login action выставляет cookie и принимает только безопасный `returnTo`; logout action отзывает текущую сессию.

- [x] **Шаг 1: написать падающие route-тесты**

```tsx
test("admin responses are private and non-indexable", async () => {
  const response = await adminIndexLoader({ request: authenticatedRequest });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
});
```

Добавить тесты 302 для гостя, одинакового текста ошибок входа, безопасного return path и отсутствия Header/Footer сайта на admin-route.

- [x] **Шаг 2: подтвердить RED**

Выполнить: `node --import tsx --test src/routes/admin/routes.test.tsx`

Ожидается: admin route modules отсутствуют.

- [x] **Шаг 3: зарегистрировать отдельную route-ветку**

```ts
route("admin/login/", "routes/admin/login.tsx"),
layout("routes/admin/layout.tsx", [
  route("admin/", "routes/admin/index.tsx"),
  route("admin/logout/", "routes/admin/logout.tsx"),
]),
```

В `root.tsx` при пути `/admin/` рендерить только `<Outlet />`, не публичные Header/Footer/FloatingButtons.

- [x] **Шаг 4: реализовать доступный login и shell**

Форма имеет видимые label, autocomplete `username`/`current-password`, focus summary при ошибке и кнопку без клиентского хранения credentials. Shell предоставляет desktop sidebar и mobile drawer, доступные клавиатурой.

- [x] **Шаг 5: подтвердить GREEN, typecheck и SSR build**

Выполнить: `node --import tsx --test src/routes/admin/routes.test.tsx && yarn typecheck && DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn build`

Ожидается: PASS.

- [x] **Шаг 6: зафиксировать задачу**

```bash
git add src/routes.ts src/root.tsx src/routes/admin src/styles/index.css
git commit -m "feat(admin): add protected ssr route shell"
```

---

### Задача 5. Публичное S3-хранилище и обработка изображений

**Файлы:**

- Изменить: `package.json`
- Изменить: `yarn.lock`
- Создать: `src/server/media/config.ts`
- Создать: `src/server/media/inspect.ts`
- Создать: `src/server/media/keys.ts`
- Создать: `src/server/media/store.ts`
- Создать: `src/server/media/config.test.ts`
- Создать: `src/server/media/inspect.test.ts`
- Создать: `src/server/media/keys.test.ts`
- Создать: `src/server/media/store.test.ts`

**Интерфейсы:**

- `readPublicMediaConfig(env): PublicMediaConfig` читает endpoint/region/bucket/credentials/prefix/publicBaseUrl.
- `inspectAndTransformImage(bytes)` возвращает проверенный original и уникальные WebP variants.
- `mediaObjectKeys(checksum, mime, widths)` создаёт `media/v1/<prefix>/<digest>/...`.
- `PublicMediaStore` предоставляет `putTemporary`, `putFinal`, `head`, `delete`, `listOlderThan`.

- [x] **Шаг 1: написать падающие тесты форматов и ключей**

```ts
test("does not upscale a 900px source", async () => {
  const result = await inspectAndTransformImage(fixture("900x600.png"));
  assert.deepEqual(result.variants.map(v => v.width), [640, 900]);
});

test("key never contains the original filename", () => {
  assert.doesNotMatch(mediaObjectKey(checksum, "image/jpeg", "original"), /client-name/);
});
```

Добавить отказ для GIF/SVG, spoofed MIME, 20 MiB+, 40 MP+ и битого файла.

- [x] **Шаг 2: подтвердить RED**

Выполнить: `node --import tsx --test src/server/media/config.test.ts src/server/media/inspect.test.ts src/server/media/keys.test.ts src/server/media/store.test.ts`

Ожидается: media modules отсутствуют.

- [x] **Шаг 3: установить Sharp**

Выполнить: `yarn add sharp`

Зафиксировать точную версию в lockfile; Puppeteer download остаётся отключённым существующей Docker-конфигурацией.

- [x] **Шаг 4: реализовать проверки и S3-адаптер**

```ts
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 40_000_000;
export const MEDIA_WIDTHS = [640, 1280, 1920] as const;
```

Sharp читает metadata с ограничением пикселей, применяет autorotate, удаляет лишние metadata и создаёт WebP. S3 операции имеют abort timeout, финальные объекты получают `public, max-age=31536000, immutable`, временные — `private, no-store`.

- [x] **Шаг 5: подтвердить GREEN**

Выполнить целевой тест из шага 2 и `yarn typecheck`; ожидается PASS.

- [x] **Шаг 6: зафиксировать задачу**

```bash
git add package.json yarn.lock src/server/media
git commit -m "feat(media): add validated s3 image pipeline"
```

---

### Задача 6. Транзакционный media service и медиатека

**Файлы:**

- Создать: `src/server/media/repository.ts`
- Создать: `src/server/media/service.ts`
- Создать: `src/server/media/repository.test.ts`
- Создать: `src/server/media/service.test.ts`
- Создать: `src/routes/admin/media.tsx`
- Создать: `src/routes/admin/media.test.tsx`
- Создать: `scripts/sweep-public-media.ts`
- Изменить: `package.json`
- Изменить: `src/routes.ts`

**Интерфейсы:**

- `createMediaService(db, store, config)` предоставляет `upload`, `list`, `updateMetadata`, `deleteUnused`, `sweepOrphans`.
- `upload` возвращает существующий asset при `(checksum, public, processingVersion=1)` и удаляет временный объект всегда.
- Media action принимает multipart field `image`, `_csrf`, `expectedVersion` для metadata edits.

- [x] **Шаг 1: написать падающие consistency-тесты**

```ts
test("database failure removes only newly-created final objects", async () => {
  repository.insert = async () => { throw new Error("db_down"); };
  await assert.rejects(() => service.upload(input));
  assert.deepEqual(store.deleted.sort(), store.newFinalKeys.sort());
  assert.equal(store.deleted.includes(store.preexistingKey), false);
});
```

Добавить тесты dedupe, temp cleanup, запрета удаления referenced asset, 409 metadata conflict и 24-часового orphan safety window.

- [x] **Шаг 2: подтвердить RED**

Выполнить: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test node --import tsx --test src/server/media/repository.test.ts src/server/media/service.test.ts src/routes/admin/media.test.tsx`

Ожидается: repository/service/route отсутствуют.

- [x] **Шаг 3: реализовать порядок temp → final → DB → cleanup**

Каждый `putFinal` сообщает `created | existed`. Компенсация удаляет только `created` keys после повторной DB-проверки отсутствия asset. `deleteUnused` блокирует строку media asset и проверяет `content_media_refs` и `content_entries.og_media_id` перед удалением.

- [x] **Шаг 4: реализовать медиатеку и sweep CLI**

Экран показывает thumbnail, dimensions, size, alt/decorative, usage count, upload и delete. Все actions используют session/CSRF/version. Добавить script `media:sweep` без автоматического запуска в production на этом этапе.

- [x] **Шаг 5: подтвердить GREEN**

Выполнить целевой тест из шага 2 и `yarn typecheck`; ожидается PASS.

- [x] **Шаг 6: зафиксировать задачу**

```bash
git add src/server/media src/routes/admin/media.tsx src/routes/admin/media.test.tsx src/routes.ts scripts/sweep-public-media.ts package.json
git commit -m "feat(admin): add transactional media library"
```

---

### Задача 7. Admin content service: записи, связи, refs и ревизии

**Файлы:**

- Создать: `src/server/admin/contentSchemas.ts`
- Создать: `src/server/admin/contentRepository.ts`
- Создать: `src/server/admin/contentService.ts`
- Создать: `src/server/admin/contentSchemas.test.ts`
- Создать: `src/server/admin/contentRepository.test.ts`
- Создать: `src/server/admin/contentService.test.ts`
- Изменить: `src/server/content/repository.ts`
- Изменить: `src/server/content/service.ts`
- Изменить: `src/server/content/service.test.ts`

**Интерфейсы:**

- `AdminContentCommand` содержит content fields, `relations`, `mediaRefs`, `expectedVersion`, intent `draft | publish`.
- `createAdminContentService(db)` предоставляет `list`, `getEditorData`, `save`, `unpublish`, `restore`, `hardDelete`, `preview`, `listSettings`, `saveSetting`.
- Любая содержательная запись создаёт revision snapshot `{ entry, relations, mediaRefs }` в той же транзакции.

- [x] **Шаг 1: написать падающие транзакционные тесты**

```ts
test("save atomically writes entry, relations, media refs and revision", async () => {
  const saved = await service.save(command, actorId);
  assert.equal(saved.version, 2);
  assert.deepEqual(await readRelations(saved.id), command.relations);
  assert.deepEqual(await readMediaRefs(saved.id), command.mediaRefs);
  assert.equal((await readRevisions(saved.id)).length, 1);
});
```

Добавить отдельные тесты 409, unique slug, publish validation, unpublish, restore-as-new-version, cascade delete, settings version и cache/sitemap invalidation.

- [x] **Шаг 2: подтвердить RED**

Выполнить: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test node --import tsx --test src/server/admin/contentSchemas.test.ts src/server/admin/contentRepository.test.ts src/server/admin/contentService.test.ts src/server/content/service.test.ts`

Ожидается: admin content modules отсутствуют либо revision snapshot не включает relations/media refs.

- [x] **Шаг 3: реализовать строгий парсинг формы**

Relation item: `{ targetId: uuid, type: relationType, sortOrder: nonnegative int }`. Media ref: `{ mediaId: uuid, fieldPath: nonempty max 300 }`. Payload остаётся kind-specific и проходит существующую Zod-схему. Publish повторно валидирует итоговую запись после применения формы.

- [x] **Шаг 4: реализовать repository transaction и cache invalidation**

При update сначала `SELECT ... FOR UPDATE`, затем сравнение версии. Синхронизация relations/refs, revision insert и entry update выполняются одной транзакцией. Restore читает snapshot и создаёт следующую версию; история не удаляется.

- [x] **Шаг 5: подтвердить GREEN**

Выполнить целевой тест из шага 2 и `yarn typecheck`; ожидается PASS.

- [x] **Шаг 6: зафиксировать задачу**

```bash
git add src/server/admin src/server/content
git commit -m "feat(admin): add revisioned content editing service"
```

---

### Задача 8. Списки, редактор, preview, история и настройки

**Файлы:**

- Создать: `src/routes/admin/content-list.tsx`
- Создать: `src/routes/admin/content-editor.tsx`
- Создать: `src/routes/admin/content-preview.tsx`
- Создать: `src/routes/admin/settings.tsx`
- Создать: `src/routes/admin/content-routes.test.tsx`
- Создать: `src/components/admin/AdminFieldError.tsx`
- Создать: `src/components/admin/UnsavedChangesGuard.tsx`
- Создать: `src/components/admin/MediaPicker.tsx`
- Изменить: `src/routes.ts`
- Изменить: `src/styles/index.css`

**Интерфейсы:**

- List loader поддерживает `q`, `status`, `kind` с нормализованными значениями.
- Editor action intents: `save-draft`, `publish`, `unpublish`, `restore`, `delete`.
- Preview action принимает текущую форму, не пишет БД и возвращает presentation model.
- Settings action принимает `key`, JSON-compatible structured value, `_csrf`, `expectedVersion`.

- [x] **Шаг 1: написать падающие route/component-тесты**

```tsx
test("409 keeps submitted text and shows the current server version", async () => {
  const response = await editorAction(conflictingRequest);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).fields.bodyMd, "мой несохранённый текст");
});
```

Добавить тесты всех intents, invalid kind 404, draft filtering, server validation errors, preview without writes, typed delete confirmation и unsaved changes guard.

- [x] **Шаг 2: подтвердить RED**

Выполнить: `node --import tsx --test src/routes/admin/content-routes.test.tsx`

Ожидается: route modules отсутствуют.

- [x] **Шаг 3: зарегистрировать маршруты и реализовать loaders/actions**

```ts
route("admin/content/:kind/", "routes/admin/content-list.tsx"),
route("admin/content/:kind/new/", "routes/admin/content-editor.tsx", { id: "admin-content-new" }),
route("admin/content/:kind/:id/", "routes/admin/content-editor.tsx", { id: "admin-content-edit" }),
route("admin/content/:kind/preview/", "routes/admin/content-preview.tsx"),
route("admin/settings/", "routes/admin/settings.tsx"),
```

- [x] **Шаг 4: собрать доступный интерфейс**

Редактор содержит вкладки «Контент», «SEO», «Связи», «Предпросмотр», «История»; отдельные кнопки draft/publish; inline errors плюс summary; MediaPicker использует UUID. Все control имеют label, focus state и keyboard operation. Unsaved guard использует React Router blocker и `beforeunload` только при реальном dirty state.

- [x] **Шаг 5: подтвердить GREEN и build**

Выполнить: `node --import tsx --test src/routes/admin/content-routes.test.tsx && yarn typecheck && DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn build`

Ожидается: PASS.

- [x] **Шаг 6: зафиксировать задачу**

```bash
git add src/routes.ts src/routes/admin src/components/admin src/styles/index.css
git commit -m "feat(admin): add content editor and settings ui"
```

---

### Задача 9. Разрешение media refs в публичном SSR

**Файлы:**

- Создать: `src/server/media/presentation.ts`
- Создать: `src/server/media/presentation.test.ts`
- Изменить: `src/server/content/presentation.ts`
- Изменить: `src/server/content/presentation.test.ts`
- Изменить: `src/components/MarkdownContent.tsx`
- Изменить: `src/components/MarkdownContent.test.tsx`

**Интерфейсы:**

- `resolveMediaAsset(asset, publicBaseUrl)` возвращает original/srcset/sizes/alt/dimensions.
- Markdown URL `media:<uuid>` разрешается только через переданный SSR media map; неизвестный UUID не превращается во внешний URL.
- Payload media UUID разрешаются presentation-слоем, а не UI-компонентами.

- [x] **Шаг 1: написать падающие presentation-тесты**

```ts
test("renders a media uuid as immutable CDN srcset", () => {
  const html = renderMarkdown("![Команда](media:asset-id)", mediaMap);
  assert.match(html, /https:\/\/cdn\.example\/media\/v1\//);
  assert.match(html, /640w/);
  assert.doesNotMatch(html, /media:asset-id/);
});
```

- [x] **Шаг 2: подтвердить RED**

Выполнить: `node --import tsx --test src/server/media/presentation.test.ts src/server/content/presentation.test.ts src/components/MarkdownContent.test.tsx`

Ожидается: `media:` остаётся неразрешённым.

- [x] **Шаг 3: реализовать server-side media map и безопасный renderer**

Публичные loaders получают media assets одним batch query по `content_media_refs`; N+1 запрещён. Renderer не принимает произвольный URL из UUID-поля и экранирует alt.

- [x] **Шаг 4: подтвердить GREEN и SEO SSR**

Выполнить целевой тест из шага 2 и существующие route/SEO тесты; ожидается PASS.

- [ ] **Шаг 5: зафиксировать задачу**

```bash
git add src/server/media/presentation.ts src/server/media/presentation.test.ts src/server/content/presentation.ts src/server/content/presentation.test.ts src/components/MarkdownContent.tsx src/components/MarkdownContent.test.tsx
git commit -m "feat(media): render postgres media references"
```

---

### Задача 10. Dry-run/apply миграция изображений

**Файлы:**

- Создать: `src/server/media/migration.ts`
- Создать: `src/server/media/migration.test.ts`
- Создать: `scripts/migrate-media-to-s3.ts`
- Создать: `scripts/verify-media-migration.ts`
- Создать: `scripts/migrate-media-to-s3.test.ts`
- Изменить: `package.json`
- Изменить: `Dockerfile`

**Интерфейсы:**

- `discoverMediaMigration(root, db)` возвращает deterministic report с batch ID/checksum/counts/problems/replacements.
- `applyMediaMigration(report, db, service)` принимает только неизменённый report checksum и идемпотентно применяет media mapping.
- Scripts: `media:migrate --dry-run --report <path>`, `media:migrate --apply --report <path>`, `media:verify --report <path>`.

- [ ] **Шаг 1: написать падающие fixture-тесты**

```ts
test("dry-run never mutates database, s3 or source files", async () => {
  const before = await snapshotFixtureState();
  await discoverMediaMigration(fixtureRoot, db);
  assert.deepEqual(await snapshotFixtureState(), before);
  assert.equal(fakeStore.operations.length, 0);
});
```

Добавить tests для duplicates, missing, unreadable, external URL, path traversal, changed report checksum, resume и exact counts/revisions/relations.

- [ ] **Шаг 2: подтвердить RED**

Выполнить: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test node --import tsx --test src/server/media/migration.test.ts scripts/migrate-media-to-s3.test.ts`

Ожидается: migration modules отсутствуют.

- [ ] **Шаг 3: реализовать deterministic discovery/report**

Сканировать PostgreSQL `body_md`, payload и OG refs, затем русские legacy SQLite/Markdown/JSON только для сверки. Локальный путь после `realpath` обязан оставаться внутри allowlisted roots `public/`, `src/assets/`, `src/blog/`, `server/data/`; network fetch внешних URL не выполняется.

- [ ] **Шаг 4: реализовать идемпотентный apply/verify**

Apply создаёт S3 объекты через media service, затем транзакционно переписывает Markdown в `media:<uuid>`, payload в UUID и заполняет refs. В `site_settings` сохраняется batch manifest. Verify сравнивает counts, revisions, relations, local references и S3 HEAD/checksum.

- [ ] **Шаг 5: подтвердить GREEN**

Выполнить целевой тест из шага 2, `yarn typecheck` и dry-run на текущем checkout; ожидается PASS и JSON report без изменений данных.

- [ ] **Шаг 6: зафиксировать задачу**

```bash
git add src/server/media/migration.ts src/server/media/migration.test.ts scripts/migrate-media-to-s3.ts scripts/verify-media-migration.ts scripts/migrate-media-to-s3.test.ts package.json Dockerfile
git commit -m "feat(media): add resumable legacy migration"
```

---

### Задача 11. Tombstone старых API и production-конфигурация

**Файлы:**

- Изменить: `server/api-app.js`
- Создать: `server/routes/legacy-admin-tombstones.js`
- Создать: `server/routes/legacy-admin-tombstones.test.js`
- Изменить: `server/runtime.mjs`
- Изменить: `docker-compose.yml`
- Изменить: `docker-compose.team.yml`
- Изменить: `.github/workflows/docker-build.yml`
- Изменить: `deploy/env/operations.env.example`
- Изменить: `tests/runtimeApiComposition.test.mjs`

**Интерфейсы:**

- Mutating methods legacy `/api/posts`, `/api/projects`, `/api/content`, `/api/admin` возвращают 410 до старых handlers.
- Read-only legacy admin endpoints не монтируются новым runtime.
- Runtime получает `ADMIN_SESSION_HMAC_KEY`, `ADMIN_RATE_LIMIT_HMAC_KEY`, `ADMIN_TRUSTED_ORIGIN` и `PUBLIC_MEDIA_S3_*` только через environment/secrets.

- [ ] **Шаг 1: написать падающий regression-тест legacy writes**

```js
test("legacy admin writes are gone without touching sqlite", async () => {
  const before = await checksum(sqlitePath);
  const response = await request(app).post("/api/posts").send({ title: "blocked" });
  assert.equal(response.status, 410);
  assert.equal(await checksum(sqlitePath), before);
});
```

- [ ] **Шаг 2: подтвердить RED**

Выполнить: `node --test server/routes/legacy-admin-tombstones.test.js tests/runtimeApiComposition.test.mjs`

Ожидается: старый handler доступен или tombstone отсутствует.

- [ ] **Шаг 3: смонтировать tombstones и убрать legacy routers**

Tombstone принимает только перечисленные legacy paths/mutating methods и отвечает JSON `{ "error": "legacy_admin_gone" }`. Он не читает body и не вызывает SQL.js/bootstrap. Public legacy redirect `/project/:slug/` сохраняется.

- [ ] **Шаг 4: добавить конфигурацию runtime/CI/Compose**

CI использует только fixture secrets. Compose config должен проходить без печати реальных значений. Production secrets не добавляются в git.

- [ ] **Шаг 5: подтвердить GREEN и Compose parsing**

Выполнить: `node --test server/routes/legacy-admin-tombstones.test.js tests/runtimeApiComposition.test.mjs && docker compose config --quiet && docker compose -f docker-compose.team.yml config --quiet`

Ожидается: PASS.

- [ ] **Шаг 6: зафиксировать задачу**

```bash
git add server .github/workflows/docker-build.yml docker-compose.yml docker-compose.team.yml deploy/env/operations.env.example tests/runtimeApiComposition.test.mjs
git commit -m "feat(admin): retire legacy write endpoints"
```

---

### Задача 12. Сквозные проверки и эксплуатационная документация

**Файлы:**

- Создать: `tests/adminSecurity.test.mjs`
- Создать: `tests/adminE2e.test.mjs`
- Создать: `docs/runbooks/admin-media-cutover.md`
- Изменить: `docs/PRODUCTION_DEPLOYMENT.md`
- Изменить: `docs/superpowers/plans/2026-09-17-kordev-admin-media.md`

**Интерфейсы:**

- E2E запускает built runtime с тестовой PostgreSQL и fake S3 adapter, создаёт admin через безопасный test helper и проходит login → draft → preview → publish → unpublish → restore → delete.
- Security test проверяет headers, гостевой доступ, CSRF, expired session, return-path и отсутствие секретов в HTML.
- Runbook фиксирует dry-run, reviewed report checksum, backup, inactive-slot smoke, ручной switch и non-destructive rollback.

- [ ] **Шаг 1: написать падающие browser/security сценарии**

```js
test("admin browser flow publishes without rebuild", async () => {
  await login(page);
  const id = await createDraft(page, fixtureArticle);
  await previewDraft(page, id);
  await publishDraft(page, id);
  assert.match(await publicHtml("/blog/fixture-article/"), /Проверочный материал/);
});
```

- [ ] **Шаг 2: подтвердить RED**

Выполнить: `node --test tests/adminSecurity.test.mjs tests/adminE2e.test.mjs`

Ожидается: хотя бы один полный сценарий не проходит до финальной wiring/configuration.

- [ ] **Шаг 3: исправить только выявленные integration gaps**

Не добавлять новое продуктовое поведение. Исправлять только route wiring, focus/accessibility, request/response contracts, test adapter injection и безопасные error boundaries, необходимые для прохождения утверждённых сценариев.

- [ ] **Шаг 4: написать cutover/rollback runbook**

Документ обязан содержать точные команды для backup, `db:migrate`, media dry-run/apply/verify, admin bootstrap, inactive-slot health/admin smoke, ручного Traefik switch и отката без разрушительного DB downgrade. Реальные secrets и домашний адрес не включать.

- [ ] **Шаг 5: выполнить полную проверку**

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn test
yarn typecheck
DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn build
docker compose config --quiet
docker compose -f docker-compose.team.yml config --quiet
```

Ожидается: все команды завершаются кодом 0; skips допустимы только для уже документированных тестов, требующих внешней production-инфраструктуры.

- [ ] **Шаг 6: отметить выполненные пункты и зафиксировать задачу**

```bash
git add tests/adminSecurity.test.mjs tests/adminE2e.test.mjs docs/runbooks/admin-media-cutover.md docs/PRODUCTION_DEPLOYMENT.md docs/superpowers/plans/2026-09-17-kordev-admin-media.md
git commit -m "test(admin): verify editor and media cutover"
```

## Финальная контрольная точка

После выполнения всех задач применить `superpowers:verification-before-completion`, затем `superpowers:requesting-code-review`. Не выполнять push, production media apply или Traefik switch без отдельной команды владельца.
