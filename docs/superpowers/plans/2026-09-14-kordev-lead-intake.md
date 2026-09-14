# План реализации надёжного приёма заявок KorDevTeam

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ДОПОЛНИТЕЛЬНЫЙ НАВЫК: используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, чтобы выполнять этот план по задачам. Для отслеживания прогресса шаги оформлены флажками (`- [ ]`).

**Цель:** добавить переиспользуемую русскоязычную форму, которая надёжно сохраняет принятую заявку в PostgreSQL, а затем независимо доставляет её в Kusidis/Krasotula CRM и на `team@korotkov.dev`, включая одно безопасно проверенное приватное вложение.

**Архитектура:** React-форма потоково отправляет multipart-данные в Express-маршрутизатор, экспортируемый из серверного бандла React Router. Отдельный TypeScript-сервис заявок валидирует и проверяет загрузку, сохраняет её в приватном хранилище Timeweb S3 и атомарно записывает в PostgreSQL заявку вместе с двумя outbox-заданиями. Один отдельный worker из того же неизменяемого образа забирает задания с арендой через PostgreSQL, соблюдает предоставленный контракт CRM и правила SMTP, а ежедневная команда удаляет копии сайта через 30 дней.

**Технологический стек:** Node 22.22, React 18, React Router 7.9.4, Express 5, TypeScript 5.9, PostgreSQL 16, Drizzle ORM/Kit, Busboy, Nodemailer, yauzl, AWS SDK v3, ClamAV INSTREAM, встроенный запуск тестов Node, Testing Library, Docker Compose, systemd.

**Спецификация:** `docs/superpowers/specs/2026-09-14-kordev-lead-intake-design.md`

## Общие ограничения

- Сохранить Node `22.22.0`, React `18.3.1`, React Router `7.9.4`, Vite `6.3.5`, PostgreSQL `16` и текущее визуальное направление со светлой и тёмной темами.
- Публичные поля строго ограничены обязательными `name` и `phone`, необязательными `description` и одним `file`, а также обязательным только для сайта `consent`; не добавлять email, компанию, услугу или бюджет.
- Принимать один файл размером не более `26_214_400` байт: PDF, DOC, DOCX, XLS, XLSX, JPG/JPEG или PNG с совпадающими расширением, заявленным MIME-типом и проверенным содержимым.
- Хранить endpoint и токен CRM, учётные данные SMTP и приватного S3, адрес ClamAV и HMAC-ключ только на сервере.
- Публичный успешный ответ означает, что локальная заявка, подтверждение согласия, метаданные вложения и оба outbox-задания надёжно записаны; он не означает, что доставка в CRM или SMTP уже завершилась.
- Использовать один стабильный браузерный UUID для повторов неизменённой отправки и отдельный неизменяемый UUID заявки как `Idempotency-Key` CRM.
- Повторы CRM используют идентичные поля и байты файла, прекращаются до истечения 24-часовой записи идемпотентности и не превышают 20 изменяющих запросов в минуту на токен.
- Не сохранять исходный IP клиента. Хранить принадлежащие сайту заявку и приватный объект ровно 30 дней, после чего удалять объект до строки базы данных.
- Использовать honeypot и ограничения частоты без CAPTCHA. Не отправлять событие успешной аналитики для проигнорированных honeypot-запросов.
- Обычные анимации сохраняются; `MotionConfig reducedMotion="user"` продолжает учитывать `prefers-reduced-motion`.
- Тесты и проверки готовности к релизу не должны обращаться к реальным CRM, SMTP или production S3 и не должны создавать тестовую заявку в production без явного включения оператором.
- Не выполнять push, развёртывание или переключение production в рамках реализации без нового явного запроса владельца.

---

## Структура файлов, зафиксированная планом

Создать:

- `src/server/leads/contracts.ts` — константы и типы нормализованного ввода, публичного ответа, заданий и адаптеров.
- `src/server/leads/config.ts` — закрытая по умолчанию проверка окружения web/worker без сетевых обращений.
- `src/server/leads/errors.ts` — стабильные безопасные коды ошибок и сопоставление с публичными статусами.
- `src/server/leads/validation.ts` — нормализация полей, телефона, контекста, fingerprint, имени файла и HMAC.
- `src/server/leads/repository.ts` — операции PostgreSQL для идемпотентности, rate limit, аренды outbox-заданий и хранения.
- `src/server/leads/multipart.ts` — ограниченный разбор Busboy в временные файлы с правами `0600`.
- `src/server/leads/fileInspection.ts` — проверки MIME, расширения, сигнатуры, OOXML ZIP и устаревшего CFB.
- `src/server/leads/clamav.ts` — адаптер ClamAV INSTREAM.
- `src/server/leads/objectStore.ts` — адаптер загрузки, материализации, удаления и перечисления объектов в приватном Timeweb S3.
- `src/server/leads/service.ts` — координация приёма и компенсационное удаление из S3.
- `src/server/leads/http.ts` — HTTPS Express-маршрутизатор для одного origin и безопасное сопоставление ответов.
- `src/server/leads/crm.ts` — адаптер предоставленного Kusidis Website Intake API.
- `src/server/leads/email.ts` — SMTP-адаптер с детерминированным Message-ID.
- `src/server/leads/retry.ts` — ограниченная классификация и расписание повторов.
- `src/server/leads/worker.ts` — цикл обработки outbox с арендой заданий.
- `src/server/leads/retention.ts` — удаление через 30 дней и очистка бесхозных объектов.
- `server/lead-worker.mjs` — production-точка входа worker, импортирующая собранный серверный бандл.
- `server/lead-retention.mjs` — ограниченная ежедневная команда хранения.
- `src/components/LeadForm.tsx` — переиспользуемая доступная браузерная форма.
- `tests/fixtures/leads/clean.doc` и `tests/fixtures/leads/clean.xls` — минимальные нечувствительные контейнеры старых форматов Office для тестов структуры.
- `tests/fixtures/deploy-leads.env` — только тестовые значения для построения production-топологии Compose в тестах.
- `deploy/systemd/kordevteam-lead-retention.service` и `deploy/systemd/kordevteam-lead-retention.timer` — ежедневное расписание очистки.
- Сфокусированные тесты рядом с каждым серверным TypeScript-модулем, а также `tests/ssr/leads.test.ts` и `tests/deploy/leads.test.mjs`.

Изменить:

- `package.json`, `yarn.lock` — зависимости и команды для multipart, SMTP, проверки ZIP и DOM-тестов.
- `src/server/db/schema.ts`, `drizzle/0001_lead_intake.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0001_snapshot.json` — таблицы заявок, enum, индексы и ограничения.
- `src/server/db/schema.test.ts` — интеграционные тесты каскадов и ограничений.
- `src/entry.server.tsx` — экспорт фабрик маршрутизатора, readiness, worker и retention в production-бандл.
- `server/api-app.js`, `server/runtime.mjs` — подключение multipart до разбора JSON и составная проверка готовности.
- `src/components/Contact.tsx`, `src/locales/ru.json` — встраивание формы и русский текст состояний/ошибок.
- `src/routes/legal.tsx` — приведение черновика политики к фактическим полям и обработчикам с последующей проверкой владельцем.
- `tests/ssr/support/runtime.ts` — безопасные локальные тестовые настройки заявок.
- `Dockerfile`, `docker-compose.yml`, `deploy/docker-compose.team.yml` — доступное для записи приватное временное пространство, ClamAV, один worker и конфигурация только для backend.
- `scripts/deploy-slot.sh`, `scripts/switch-slot.sh`, `scripts/rollback-slot.sh`, `scripts/deploy-common.sh` — проверка образа/конфигурации worker и синхронизация с активным релизом.
- `tests/deploy/readiness.test.mjs`, `tests/deploy/image.test.mjs`, `tests/deploy/scripts.test.mjs`, `tests/postgresCompose.test.ts` — регрессионное покрытие развёртывания.
- `server/.env.example`, `server/README.md`, `deploy/README.md`, `.github/workflows/docker-build.yml` — конфигурация оператора и проверочные барьеры.

Не изменять старый SQLite-путь заявок, потому что его нет. Не переиспользовать `server/utils/s3.js`: он намеренно поддерживает публичные URL медиа и fallback для ACL, тогда как вложения заявок требуют отдельной закрытой по умолчанию приватной политики.

---

### Задача 1: Зафиксировать контракт заявки, конфигурацию и чистую валидацию

**Файлы:**

- Изменить: `package.json`
- Изменить: `yarn.lock`
- Создать: `src/server/leads/contracts.ts`
- Создать: `src/server/leads/config.ts`
- Создать: `src/server/leads/errors.ts`
- Создать: `src/server/leads/validation.ts`
- Тест: `src/server/leads/validation.test.ts`
- Тест: `src/server/leads/config.test.ts`

**Интерфейсы:**

- Создаёт: `MAX_FILE_BYTES = 26_214_400`, `MAX_DESCRIPTION_LENGTH = 10_000`, `CONSENT_FIELD_VALUE = "accepted"`.
- Создаёт: `normalizeLeadFields(raw: RawLeadFields): NormalizedLeadFields`.
- Создаёт: `normalizeLeadContext(raw: RawLeadContext): LeadContext`.
- Создаёт: `requestFingerprint(input: FingerprintInput): string` и `subjectHash(secret: string, kind: "ip" | "phone" | "crm_token", value: string): string`.
- Создаёт: `readLeadWebConfig(env): LeadWebConfig`, `assertLeadWebConfig(env): void` и `readLeadWorkerConfig(env): LeadWorkerConfig`.
- Создаёт: `LeadError` с фиксированными `code`, HTTP-статусом, необязательным ограниченным `retryAfterSeconds` и без произвольного публичного сообщения.

- [ ] **Шаг 1: Написать падающие тесты контракта и валидации**

```ts
test("normalizes the exact approved fields", () => {
  assert.deepEqual(normalizeLeadFields({
    name: "  Анна  ", phone: "+7 (999) 111-22-33", description: "  Нужна CRM  ",
    consent: "accepted", website: "",
  }), {
    name: "Анна", phone: "+7 (999) 111-22-33", phoneDigits: "79991112233",
    description: "Нужна CRM", consent: true, honeypot: "",
  });
});

test("rejects removed fields and contract boundaries", () => {
  assert.throws(() => normalizeLeadFields({ name: "Анна", phone: "1234", consent: "accepted", email: "a@b.ru" }), /validation_error/);
  assert.throws(() => normalizeLeadFields({ name: "Анна", phone: "12345", consent: "no" }), /validation_error/);
  assert.throws(() => normalizeLeadFields({ name: " ", phone: "12345", consent: "accepted" }), /validation_error/);
});

test("fingerprints are canonical and HMAC domains are separated", () => {
  assert.equal(requestFingerprint(first), requestFingerprint(reordered));
  assert.notEqual(subjectHash("secret", "ip", "79991112233"), subjectHash("secret", "phone", "79991112233"));
});
```

- [ ] **Шаг 2: Запустить тесты и подтвердить падение импортов**

Команда: `yarn tsx --test src/server/leads/validation.test.ts src/server/leads/config.test.ts`

Ожидается: FAIL, потому что модули заявок ещё не существуют.

- [ ] **Шаг 3: Установить зафиксированные runtime- и тестовые зависимости**

Команды:

```bash
yarn add busboy nodemailer yauzl
yarn add --dev @types/busboy @types/nodemailer @types/yauzl @testing-library/dom @testing-library/react @testing-library/user-event @types/jsdom jsdom
```

Сохранить разрешённые Yarn версии в `yarn.lock`; не менять текущие зафиксированные версии Node, React, router, Vite, PostgreSQL и Drizzle.

- [ ] **Шаг 4: Определить точные типы, ошибки и нормализацию**

```ts
export const MAX_FILE_BYTES = 26_214_400;
export const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 131_072;
export const MAX_DESCRIPTION_LENGTH = 10_000;
export const CONSENT_FIELD_VALUE = "accepted";

export type RawLeadFields = Record<string, string | undefined>;
export type NormalizedLeadFields = {
  name: string;
  phone: string;
  phoneDigits: string;
  description: string | null;
  consent: true;
  honeypot: string;
};
export type LeadContext = {
  pagePath: string;
  referrer: string | null;
  utm: Partial<Record<"source" | "medium" | "campaign" | "content" | "term", string>>;
};
export type AcceptedResponse = { leadId: string; status: "accepted" };
export type RawLeadContext = Partial<Record<"pagePath" | "referrer" | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm", string>>;
export type FingerprintInput = { fields: NormalizedLeadFields; context: LeadContext; consentVersion: string; attachmentSha256: string | null };
export type StagedAttachment = { path: string; originalName: string; declaredMime: string; byteSize: number; sha256: string };
export type AllowedMediaType = "application/pdf" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "image/jpeg" | "image/png";
export type StoredLead = { id: string; submissionKey: string; requestFingerprint: string; consentVersion: string; successResponse: AcceptedResponse };
export type ClaimedJob = { id: string; leadId: string; channel: "crm" | "email"; attemptCount: number; acceptedAt: Date; leaseExpiresAt: Date; lead: NormalizedLeadFields & { pagePath: string; referrer: string | null }; attachment: null | { objectKey: string; originalName: string; mediaType: AllowedMediaType; sha256: string } };
```

Разрешить только `name`, `phone`, `description`, `consent`, `website`, `pagePath`, `referrer`, `utmSource`, `utmMedium`, `utmCampaign`, `utmContent` и `utmTerm`. Обрезать пробелы, нормализовать CRLF в LF, ограничить значения контекста 500 символами, принимать только абсолютный путь в `pagePath`, а referrer сокращать до origin и пути. Для name/description считать кодовые точки Unicode, а для телефонного правила CRM — цифры ASCII.

Для fingerprint запроса использовать SHA-256 от канонического отсортированного JSON, а для субъектов rate limit — HMAC-SHA-256 с префиксами доменов. Сравнивать fingerprint через `timingSafeEqual` после проверки равной длины в байтах.

- [ ] **Шаг 5: Разбирать конфигурацию без раскрытия значений**

```ts
export type LeadWebConfig = {
  consentVersion: string;
  hashKey: string;
  tempRoot: string;
  clamav: { host: string; port: number; timeoutMs: number };
  s3: LeadS3Config;
};

export type LeadS3Config = {
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  serverSideEncryption: "AES256";
};

export type LeadWorkerConfig = LeadWebConfig & {
  crm: { endpoint: URL; token: string; timeoutMs: 15_000 };
  smtp: { host: string; port: number; secure: boolean; user: string; password: string; from: string; to: "team@korotkov.dev" };
};
```

Production требует непустой `LEAD_CONSENT_VERSION`, base64-значение `LEAD_HASH_KEY`, декодируемое минимум в 32 байта, все значения `LEAD_S3_*`, `CLAMAV_HOST`, `CLAMAV_PORT`, HTTPS-адрес `CRM_INTAKE_ENDPOINT`, заканчивающийся на `/api/v1/board-intake/{publicId}/requests`, `CRM_INTAKE_TOKEN`, все значения `SMTP_*` и `LEAD_EMAIL_TO=team@korotkov.dev`. Фабрики разработки и тестов получают явные безопасные значения; не встраивать fallback-секреты, похожие на production.

- [ ] **Шаг 6: Обеспечить прохождение сфокусированных тестов и typecheck**

Команда: `yarn tsx --test src/server/leads/validation.test.ts src/server/leads/config.test.ts && yarn typecheck`

Ожидается: все сфокусированные тесты проходят, typecheck завершается с кодом `0`.

- [ ] **Шаг 7: Зафиксировать срез контракта коммитом**

```bash
git add package.json yarn.lock src/server/leads/contracts.ts src/server/leads/config.ts src/server/leads/errors.ts src/server/leads/validation.ts src/server/leads/validation.test.ts src/server/leads/config.test.ts
git commit -m "feat(leads): define intake contract and configuration"
```

---

### Задача 2: Добавить PostgreSQL-схему заявок, вложений, outbox и rate limit

**Файлы:**

- Изменить: `src/server/db/schema.ts`
- Изменить: `src/server/db/schema.test.ts`
- Создать: `drizzle/0001_lead_intake.sql`
- Изменить: `drizzle/meta/_journal.json`
- Создать: `drizzle/meta/0001_snapshot.json`

**Интерфейсы:**

- Создаёт: экспорты Drizzle `leads`, `leadAttachments`, `leadDeliveryJobs` и `leadRateLimits`.
- Создаёт: enum `leadDeliveryChannel`, `leadDeliveryStatus` и `leadRateLimitKind`.
- Сохраняет: существующие таблицы контента/администраторов и поведение `resetTestDatabase()`.

- [ ] **Шаг 1: Добавить падающий интеграционный тест схемы**

```ts
databaseTest("lead deletion cascades its attachment and two channel jobs", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [lead] = await db.insert(leads).values(leadFixture).returning();
  await db.insert(leadAttachments).values(attachmentFixture(lead.id));
  await db.insert(leadDeliveryJobs).values([
    { leadId: lead.id, channel: "crm" },
    { leadId: lead.id, channel: "email" },
  ]);
  await db.delete(leads).where(eq(leads.id, lead.id));
  assert.equal((await db.select().from(leadAttachments)).length, 0);
  assert.equal((await db.select().from(leadDeliveryJobs)).length, 0);
});
```

Также проверить дублирование `submission_key`, дублирование `(lead_id, channel)`, более одного вложения и отрицательные значения попыток/счётчиков.

- [ ] **Шаг 2: Запустить тест схемы и подтвердить отсутствие экспортов**

Команда: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/db/schema.test.ts`

Ожидается: FAIL, потому что четыре таблицы заявок ещё не определены.

- [ ] **Шаг 3: Добавить таблицы Drizzle с ограничениями**

```ts
export const leadDeliveryChannel = pgEnum("lead_delivery_channel", ["crm", "email"]);
export const leadDeliveryStatus = pgEnum("lead_delivery_status", [
  "pending", "processing", "retry", "delivered", "terminal", "manual_action",
]);
export const leadRateLimitKind = pgEnum("lead_rate_limit_kind", ["ip", "phone", "crm_token"]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey(),
  submissionKey: uuid("submission_key").notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  description: text("description"),
  pagePath: varchar("page_path", { length: 500 }).notNull(),
  referrer: varchar("referrer", { length: 500 }),
  utm: jsonb("utm").$type<Record<string, string>>().notNull().default({}),
  phoneHash: varchar("phone_hash", { length: 64 }).notNull(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  consentVersion: varchar("consent_version", { length: 120 }).notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  successResponse: jsonb("success_response").$type<AcceptedResponse>().notNull(),
}, (table) => [
  uniqueIndex("leads_submission_key_uq").on(table.submissionKey),
  index("leads_expires_at_idx").on(table.expiresAt),
]);
```

Остальные таблицы определить строго по спецификации: поля ключа, checksum и проверки вложения; одно уникальное вложение на заявку; одно уникальное задание на пару заявка/канал; поля аренды; ограниченные JSON-метаданные; составной первичный ключ rate bucket `(kind, subject_hash, window_started_at)`. Добавить ограничения БД для 64-символьных hex-хешей в нижнем регистре, положительного размера вложения не более `26_214_400`, неотрицательных счётчиков и условия `expires_at > accepted_at`.

- [ ] **Шаг 4: Создать и проверить версионированную миграцию**

Команда: `yarn db:generate --name lead_intake && yarn db:check`

Ожидается: Drizzle создаёт `drizzle/0001_lead_intake.sql`, snapshot и запись журнала, а `db:check` завершается с кодом `0`. Проверить SQL: он должен только создавать три enum, четыре таблицы, их внешние ключи, индексы и ограничения, не удаляя и не переписывая таблицы контента.

- [ ] **Шаг 5: Дважды применить миграции и обеспечить прохождение тестов схемы**

Команды:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn db:migrate
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn db:migrate
TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/db/schema.test.ts
```

Ожидается: обе команды миграции завершаются с кодом `0`, все тесты схемы проходят.

- [ ] **Шаг 6: Зафиксировать срез схемы коммитом**

```bash
git add src/server/db/schema.ts src/server/db/schema.test.ts drizzle/0001_lead_intake.sql drizzle/meta/_journal.json drizzle/meta/0001_snapshot.json
git commit -m "feat(leads): add durable intake schema"
```

---

### Задача 3: Реализовать транзакционную идемпотентность, rate limit, аренду и чтение репозитория

**Файлы:**

- Создать: `src/server/leads/repository.ts`
- Тест: `src/server/leads/repository.test.ts`

**Интерфейсы:**

- Использует: нормализованные типы задачи 1 и таблицы задачи 2.
- Создаёт: `createLeadRepository(db, clock): LeadRepository`.
- Создаёт: `findBySubmissionKey(submissionKey): Promise<StoredLead | null>` для дешёвой проверки повтора до сканирования/загрузки.
- Создаёт: `consumeIpAttempt(ipHash): Promise<RateDecision>` и `accept(command): Promise<AcceptDecision>`.
- Создаёт: `claimDueJobs(ownerId, limit, leaseMs): Promise<ClaimedJob[]>`, `markDelivered`, `reschedule`, `markTerminal` и `markManualAction`.
- Создаёт: `reserveCrmTokenAttempt(tokenHash): Promise<RateDecision>`, `findExpiredLeads(limit)`, `attachmentKeyExists(key)` и `deleteLeadAfterObject(id)`.

- [ ] **Шаг 1: Написать падающие тесты конкурентности и атомарности**

```ts
databaseTest("concurrent identical accepts create one lead and two jobs", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const repository = createLeadRepository(createDb(TEST_DATABASE_URL), fixedClock);
  const results = await Promise.all(Array.from({ length: 8 }, () => repository.accept(command)));
  assert.equal(results.filter((result) => result.kind === "accepted").length, 1);
  assert.equal(results.filter((result) => result.kind === "replayed").length, 7);
  assert.equal((await db.select().from(leads)).length, 1);
  assert.deepEqual((await db.select().from(leadDeliveryJobs)).map((row) => row.channel).sort(), ["crm", "email"]);
});
```

Добавить случаи: одинаковый ключ отправки с другим fingerprint возвращает `conflict`; после внедрённой транзакционной ошибки не остаётся частичных строк; шестая попытка с одного IP получает ограниченное время повтора; четвёртая новая заявка с телефона за час отклоняется; двадцать первое резервирование CRM за минуту откладывается; просроченную аренду возвращает в работу только один конкурентный worker.

- [ ] **Шаг 2: Запустить тест репозитория и подтвердить падение**

Команда: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/leads/repository.test.ts`

Ожидается: FAIL, потому что `createLeadRepository` отсутствует.

- [ ] **Шаг 3: Реализовать сериализованный приём**

```ts
export type AcceptDecision =
  | { kind: "accepted"; response: AcceptedResponse }
  | { kind: "replayed"; response: AcceptedResponse }
  | { kind: "conflict" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

async function lockSubmission(tx: Transaction, submissionKey: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${submissionKey}, 0))`);
}
```

В одной транзакции: заблокировать ключ отправки, загрузить существующую заявку, сравнить fingerprint за постоянное время, вернуть сохранённый ответ для повтора, учитывать phone bucket только для действительно новой заявки, затем вставить заявку, необязательные метаданные вложения и ровно два задания. Рассчитать `expiresAt` как `acceptedAt + 30 * 24 * 60 * 60 * 1000` через внедрённые часы.

- [ ] **Шаг 4: Реализовать rate bucket и аренду заданий**

Для каждого bucket использовать один атомарный `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE count < limit RETURNING count`. IP допускает 5 попыток за 30 минут, телефон — 3 принятые заявки за 60 минут, токен CRM — 20 отправок за 60 секунд. Вычислять `retryAfterSeconds` из точного сохранённого конца окна и ограничивать публичное значение оставшимся временем окна.

```ts
const result = await tx.execute(sql`
  insert into lead_rate_limits (kind, subject_hash, window_started_at, count, expires_at)
  values (${kind}, ${subjectHash}, ${windowStart}, 1, ${windowEnd})
  on conflict (kind, subject_hash, window_started_at)
  do update set count = lead_rate_limits.count + 1
  where lead_rate_limits.count < ${limit}
  returning count
`);
```

Забирать готовые задания в транзакции через `FOR UPDATE SKIP LOCKED`, переводить их в `processing`, увеличивать `attempt_count` и устанавливать двухминутную аренду. Возвращать связанные неизменяемые данные заявки и метаданные вложения, но никогда не секрет. Повторно забирать только задания `processing` с истёкшей арендой.

- [ ] **Шаг 5: Обеспечить прохождение интеграционных тестов репозитория**

Команда: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/leads/repository.test.ts`

Ожидается: все тесты конкурентности, ограничений, транзакций и аренды проходят без дублирования строк.

- [ ] **Шаг 6: Зафиксировать срез репозитория коммитом**

```bash
git add src/server/leads/repository.ts src/server/leads/repository.test.ts
git commit -m "feat(leads): persist idempotent outbox submissions"
```

---

### Задача 4: Потоково принимать multipart и проверять каждый разрешённый формат файла

**Файлы:**

- Создать: `src/server/leads/multipart.ts`
- Создать: `src/server/leads/fileInspection.ts`
- Тест: `src/server/leads/multipart.test.ts`
- Тест: `src/server/leads/fileInspection.test.ts`
- Создать: `tests/fixtures/leads/clean.doc`
- Создать: `tests/fixtures/leads/clean.xls`

**Интерфейсы:**

- Использует: `MAX_FILE_BYTES`, `MAX_MULTIPART_BYTES`, разрешённые поля и `LeadError`.
- Создаёт: `parseLeadMultipart(request, tempRoot): Promise<ParsedLeadMultipart>`.
- Создаёт: `inspectAttachment(staged): Promise<VerifiedAttachment>`.
- Создаёт: `ParsedLeadMultipart.dispose(): Promise<void>`, который безопасно вызывать многократно.

- [ ] **Шаг 1: Написать падающие тесты парсера и проверки содержимого**

Создать детерминированные генераторы минимальных PDF, JPEG, PNG, DOCX и XLSX, а также небольшие сохранённые fixtures старых DOC/XLS. Проверить точный максимальный размер, превышение на один байт, пустой файл, два файла, неизвестные поля, переименованный PNG с MIME PDF, ZIP без `word/document.xml`, DOC без `WordDocument`, XLS без `Workbook`/`Book`, флаг шифрования ZIP и очистку после прерывания парсера.

```ts
test("streams one attachment to a private temporary file", async (t) => {
  const parsed = await parseLeadMultipart(requestWithFile(pdfFixture), tempRoot);
  t.after(() => parsed.dispose());
  assert.equal(parsed.attachment?.byteSize, pdfFixture.length);
  assert.equal((await stat(parsed.attachment!.path)).mode & 0o777, 0o600);
  assert.equal(parsed.attachment?.sha256, createHash("sha256").update(pdfFixture).digest("hex"));
});
```

- [ ] **Шаг 2: Запустить сфокусированные тесты и подтвердить отсутствие модулей**

Команда: `yarn tsx --test src/server/leads/multipart.test.ts src/server/leads/fileInspection.test.ts`

Ожидается: FAIL, потому что оба модуля отсутствуют.

- [ ] **Шаг 3: Реализовать ограниченную потоковую обработку Busboy**

До чтения отклонять запросы не в формате multipart и запросы с `Content-Length > MAX_MULTIPART_BYTES`. Считать каждый входящий байт потока, чтобы chunked-запросы или отсутствующий/ложный `Content-Length` не могли превысить общий лимит. Настроить Busboy на один файл, 12 полей, 500-байтовые лимиты контекста, точные лимиты name/phone/description и `fileSize: MAX_FILE_BYTES`. Потоково пропускать файл через SHA-256 transform в случайный файл с правами `0600` внутри `LEAD_TEMP_ROOT`; никогда не использовать имя пользователя как путь. При обрыве или любом лимите парсера прекращать обработку и удалять каждый временный файл в `dispose()` и путях ошибок.

```ts
const parser = busboy({
  headers: request.headers,
  limits: { files: 1, fields: 12, parts: 13, fileSize: MAX_FILE_BYTES, fieldNameSize: 32, fieldSize: MAX_DESCRIPTION_LENGTH * 4 },
});
const objectName = `${randomUUID()}.upload`;
const output = createWriteStream(resolveInside(tempRoot, objectName), { flags: "wx", mode: 0o600 });
```

- [ ] **Шаг 4: Реализовать закрытую по умолчанию проверку содержимого**

```ts
export type VerifiedAttachment = StagedAttachment & {
  originalName: string;
  mediaType: AllowedMediaType;
};

export async function inspectAttachment(staged: StagedAttachment): Promise<VerifiedAttachment> {
  const rule = ruleForExtension(staged.originalName);
  if (!rule || rule.mediaType !== staged.declaredMime) throw new LeadError("unsupported_file_type", 415);
  await rule.inspect(staged.path);
  return { ...staged, originalName: sanitizeFilename(staged.originalName), mediaType: rule.mediaType };
}
```

Проверять `%PDF-` с нулевого байта и `%%EOF` рядом с концом, восьмибайтовую сигнатуру PNG и завершающий `IEND`, маркеры SOI/EOI JPEG; отклонять сигнатуры второго формата после конца. Открывать OOXML через yauzl в lazy-режиме, отклонять зашифрованные записи, обход пути и дубли критических записей, ограничивать число записей и общий распакованный размер, требовать `[Content_Types].xml` вместе с `word/document.xml` для DOCX или `xl/workbook.xml` для XLSX. Ограниченно читать заголовок CFB, размеры секторов, цепочки FAT/DIFAT и записи каталогов; требовать `WordDocument` для DOC и `Workbook` или `Book` для XLS. Отклонять циклы, выходящие за диапазон сектора, повреждённые контейнеры и несовпадающие ожидаемые потоки.

- [ ] **Шаг 5: Обеспечить прохождение файловых тестов и отсутствие временных остатков**

Команда: `yarn tsx --test src/server/leads/multipart.test.ts src/server/leads/fileInspection.test.ts`

Ожидается: все тесты форматов и очистки проходят; временный каталог каждого теста пуст после `dispose()`.

- [ ] **Шаг 6: Зафиксировать срез безопасности загрузок коммитом**

```bash
git add src/server/leads/multipart.ts src/server/leads/fileInspection.ts src/server/leads/multipart.test.ts src/server/leads/fileInspection.test.ts
git commit -m "feat(leads): validate streamed attachments"
```

---

### Задача 5: Добавить приватный S3, ClamAV и надёжную координацию приёма

**Файлы:**

- Создать: `src/server/leads/clamav.ts`
- Создать: `src/server/leads/objectStore.ts`
- Создать: `src/server/leads/service.ts`
- Тест: `src/server/leads/clamav.test.ts`
- Тест: `src/server/leads/objectStore.test.ts`
- Тест: `src/server/leads/service.test.ts`

**Интерфейсы:**

- Использует: типы задач 1–4 и `LeadRepository`.
- Создаёт: `ClamAvScanner.scan(path): Promise<CleanScan>`.
- Создаёт: `PrivateAttachmentStore.putFile`, `materialize`, `delete` и `listOlderThan`.
- Создаёт: `createLeadService(dependencies).accept(input): Promise<ServiceDecision>`.

- [ ] **Шаг 1: Написать падающие тесты адаптеров и порядка работы сервиса**

Использовать локальную TCP-заглушку, которая записывает команду ClamAV `zINSTREAM\0`, блоки с префиксом длины и нулевой терминатор. Через внедрённый fake `S3Client` подтвердить, что `PutObjectCommand` не содержит публичного ACL, использует настроенные приватные bucket/prefix, потоково передаёт тело файла и указывает настроенное серверное шифрование. Тесты сервиса должны доказать: повтор пропускает сканирование/загрузку; вредоносный файл или недоступный scanner не создаёт заявку; чистый файл сканируется до загрузки; ошибка БД удаляет загруженный объект; конкурентный повтор удаляет лишний объект; надёжная заявка без файла создаёт оба задания без вызова S3 или ClamAV.

```ts
test("compensates the private object when persistence fails", async () => {
  const events: string[] = [];
  const service = serviceFixture({ events, repositoryAccept: async () => { throw new Error("db_down"); } });
  await assert.rejects(service.accept(cleanFileInput), /service_unavailable/);
  assert.deepEqual(events, ["inspect", "scan", "s3.put", "repository.accept", "s3.delete", "temp.dispose"]);
});

test("a stored replay performs no external file work", async () => {
  const fixture = serviceFixture({ existing: storedLead });
  assert.equal((await fixture.service.accept(identicalInput)).kind, "replayed");
  assert.deepEqual(fixture.externalCalls, []);
});
```

- [ ] **Шаг 2: Запустить тесты и подтвердить отсутствие адаптеров**

Команда: `yarn tsx --test src/server/leads/clamav.test.ts src/server/leads/objectStore.test.ts src/server/leads/service.test.ts`

Ожидается: FAIL, потому что scanner, хранилище и сервис не существуют.

- [ ] **Шаг 3: Реализовать адаптер ClamAV INSTREAM**

Открыть TCP-соединение с настроенными host/port, записать `zINSTREAM\0`, затем потоково передать весь файл блоками с четырёхбайтовым big-endian префиксом длины и завершить четырьмя нулевыми байтами. Применить единый сквозной timeout. Только `stream: OK` считать чистым результатом, `FOUND` сопоставлять с `unsafe_file`, а ошибки соединения, timeout, формата или размера — с `scan_unavailable`; сигнатуру движка включать в приватные метаданные проверки, но не в публичные ошибки.

```ts
socket.write(Buffer.from("zINSTREAM\0"));
for await (const chunk of createReadStream(path)) {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(chunk.length);
  socket.write(length);
  socket.write(chunk);
}
socket.end(Buffer.alloc(4));
```

- [ ] **Шаг 4: Реализовать адаптер приватного S3**

```ts
export interface PrivateAttachmentStore {
  putFile(input: { objectKey: string; path: string; contentType: string }): Promise<void>;
  materialize(input: { objectKey: string; tempRoot: string }): Promise<{ path: string; dispose(): Promise<void> }>;
  delete(objectKey: string): Promise<void>;
  listOlderThan(cutoff: Date): AsyncIterable<{ key: string; lastModified: Date }>;
}
```

Использовать отдельный `S3Client`, настроенный только через `LEAD_S3_*`. Передавать `createReadStream(path)` с `CacheControl: private, no-store`, настроенным SSE и без fallback на публичный URL/ACL. При материализации потоково записывать `GetObjectCommand.Body` во временный файл с правами `0600` и удалять частичные файлы. Подтверждённый `NoSuchKey` считать уже удалённым только в retention; при доставке пробрасывать эту ошибку.

- [ ] **Шаг 5: Реализовать приём в требуемом порядке**

```ts
export type ServiceDecision =
  | { kind: "accepted"; response: AcceptedResponse }
  | { kind: "replayed"; response: AcceptedResponse }
  | { kind: "ignored" }
  | { kind: "rate_limited"; retryAfterSeconds: number };
```

Сразу после ограниченного разбора возвращать `ignored`, если honeypot не пуст. Нормализовать поля/контекст, вычислить HMAC IP запроса, учесть IP-попытку, загрузить существующую отправку для определения сохранённой версии согласия, рассчитать fingerprint и вернуть replay/conflict до дорогих операций. Для нового вложения: проверить формат, просканировать, создать случайный ключ под `LEAD_S3_PREFIX`, загрузить и затем вызвать `repository.accept`. Удалять только что загруженный объект при ошибке транзакции, конфликте, rate limit или конкурентном повторе. Всегда удалять локальные временные файлы в `finally`.

После компенсации преобразовывать `conflict` репозитория в `LeadError("idempotency_conflict", 409)`; это не успешный вариант `ServiceDecision`.

- [ ] **Шаг 6: Обеспечить прохождение сфокусированных тестов сервиса**

Команда: `yarn tsx --test src/server/leads/clamav.test.ts src/server/leads/objectStore.test.ts src/server/leads/service.test.ts`

Ожидается: все тесты адаптеров, порядка операций и компенсации проходят.

- [ ] **Шаг 7: Зафиксировать срез приёма коммитом**

```bash
git add src/server/leads/clamav.ts src/server/leads/objectStore.ts src/server/leads/service.ts src/server/leads/clamav.test.ts src/server/leads/objectStore.test.ts src/server/leads/service.test.ts
git commit -m "feat(leads): accept scanned durable submissions"
```

---

### Задача 6: Подключить безопасный публичный endpoint заявок и немутирующую readiness-проверку

**Файлы:**

- Создать: `src/server/leads/http.ts`
- Изменить: `src/entry.server.tsx`
- Изменить: `server/api-app.js`
- Изменить: `server/runtime.mjs`
- Изменить: `tests/ssr/support/runtime.ts`
- Создать: `tests/ssr/leads.test.ts`
- Изменить: `tests/deploy/readiness.test.mjs`

**Интерфейсы:**

- Использует: `createLeadService`, `parseLeadMultipart` и конфигурацию задачи 1.
- Создаёт: экспортируемый из `src/entry.server.tsx` `createLeadRouter(overrides?): express.Router`.
- Создаёт: экспортируемый из `src/entry.server.tsx` `checkApplicationReady(): Promise<void>`.
- Сохраняет: форматы ответов `GET /api/health` и `GET /api/health/ready`.

- [ ] **Шаг 1: Написать падающие тесты endpoint**

```ts
test("POST /api/leads returns a durable 201 without leaking delivery state", async (t) => {
  const runtime = await startTestRuntime(leadTestEnvironment);
  t.after(runtime.close);
  const response = await fetch(`${runtime.origin}/api/leads`, {
    method: "POST",
    headers: { "Idempotency-Key": submissionKey, Origin: runtime.origin },
    body: validMultipart(),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.leadId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(body.status, "accepted");
  assert.deepEqual(Object.keys(body).sort(), ["leadId", "status"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
```

Добавить тесты для повтора `200` с `Idempotency-Replayed: true`, honeypot-ответа `202` без `leadId`, конфликта ключа `409`, статусов `413`, `415`, `422`, `429` с ограниченным `Retry-After`, безопасного `503`, неверного UUID, чужого `Origin`, межсайтового `Sec-Fetch-Site` и возврата `426` для HTTP в production. Подтвердить, что ответы не содержат SQL, путей, учётных данных, полных ошибок поставщика или исходного контакта.

- [ ] **Шаг 2: Запустить тест endpoint и подтвердить 404/отсутствующий экспорт**

Команда: `yarn build && TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test tests/ssr/leads.test.ts tests/deploy/readiness.test.mjs`

Ожидается: FAIL, потому что `/api/leads` и составная readiness-проверка отсутствуют.

- [ ] **Шаг 3: Реализовать Express-маршрутизатор и сопоставление ответов**

Требовать UUID в `Idempotency-Key`; в production требовать `req.secure`, канонический `Origin: https://kordev.team` и отсутствие `Sec-Fetch-Site` либо значение `same-origin`. Устанавливать `Cache-Control: no-store`, `Vary: Origin` и `X-Content-Type-Options: nosniff`. Подключать маршрутизатор заявок до `express.json()` и `express.urlencoded()`, чтобы эти парсеры никогда не потребляли байты multipart.

Точно сопоставлять решения сервиса:

```ts
accepted  -> 201 { leadId, status: "accepted" }
replayed  -> 200 + Idempotency-Replayed: true + stored response
ignored   -> 202 { status: "received" }
```

Сопоставлять с публичной схемой ошибки `{ error: { code, message, field_errors? }, request_id }` только значения `LeadError.code`; русские сообщения брать из фиксированной таблицы, а в журнал записывать только request ID, непрозрачный ID заявки/задания, статус/код и длительность.

- [ ] **Шаг 4: Подключить собранный маршрутизатор к существующему runtime**

```ts
// src/entry.server.tsx
export { createLeadRouter } from "./server/leads/http";
export async function checkApplicationReady(): Promise<void> {
  await checkDatabaseReady();
  assertLeadWebConfig(process.env);
}
```

```js
// server/runtime.mjs
const leadRouter = build.entry.module.createLeadRouter();
app.use(createApiApp({
  checkReady: build.entry.module.checkApplicationReady,
  leadRouter,
}));
```

В `server/api-app.js` подключить `leadRouter` на `/api/leads` до общих парсеров тела. Readiness обращается только к PostgreSQL и структурно проверяет web-конфигурацию; она не должна вставлять заявку, загружать объект, сканировать файл или вызывать CRM/SMTP.

- [ ] **Шаг 5: Обеспечить прохождение HTTP-, readiness-, build- и type-проверок**

Команда: `yarn typecheck && yarn build && TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test tests/ssr/leads.test.ts && node --test tests/deploy/readiness.test.mjs`

Ожидается: все команды проходят; тесты endpoint подтверждают точные статусы/заголовки, readiness остаётся немутирующей.

- [ ] **Шаг 6: Зафиксировать HTTP-срез коммитом**

```bash
git add src/server/leads/http.ts src/entry.server.tsx server/api-app.js server/runtime.mjs tests/ssr/support/runtime.ts tests/ssr/leads.test.ts tests/deploy/readiness.test.mjs
git commit -m "feat(leads): expose secure multipart endpoint"
```

---

### Задача 7: Реализовать точный адаптер CRM и адаптер SMTP-доставки

**Файлы:**

- Создать: `src/server/leads/crm.ts`
- Создать: `src/server/leads/email.ts`
- Создать: `src/server/leads/retry.ts`
- Тест: `src/server/leads/crm.test.ts`
- Тест: `src/server/leads/email.test.ts`
- Тест: `src/server/leads/retry.test.ts`

**Интерфейсы:**

- Использует: полученные неизменяемые данные заявки/задания и `PrivateAttachmentStore.materialize()`.
- Создаёт: `sendToCrm(envelope, config, fetchImpl): Promise<CrmReceipt>`.
- Создаёт: `sendLeadEmail(envelope, config, transport): Promise<EmailReceipt>`.
- Создаёт: `classifyDeliveryFailure(channel, error): DeliveryDecision` и `nextRetryAt(input): Date`.

`DeliveryEnvelope` содержит неизменяемое полученное задание, нормализованную заявку и необязательное материализованное вложение `{ path, originalName, mediaType, sha256 }`. `CrmReceipt` содержит только `requestId`, `taskId`, `taskCode`, `taskStatus`, `dueDate`, `replayed`, `rateLimit` и `rateRemaining`. `EmailReceipt` содержит только ID сообщения поставщика. `DeliveryDecision` принимает один из видов: `{ kind: "retry"; retryAfterSeconds?: number }`, `{ kind: "terminal"; code: string }` или `{ kind: "manual_action"; code: string }`.

- [ ] **Шаг 1: Написать падающие контрактные тесты CRM с локальным mock-сервером**

Проверить `POST /api/v1/board-intake/{publicId}/requests`, `Authorization: Bearer`, стабильный UUID заявки в `Idempotency-Key`, стабильный UUID задания в `X-Request-Id`, точные multipart-имена `name`/`phone`/необязательное `description`/один необязательный `file` и отсутствие согласия, контекста и внутренних полей. Убедиться, что успешным считается только `201` с документированной схемой ответа и сохраняются только `request_id`, `id`, `code`, `status`, `due_date` задачи и числа rate limit.

Проверить сетевую ошибку, прерывание через 15 секунд, `429` с корректным/некорректным `Retry-After`, `500`, все документированные варианты `400`/`401`/`403`/`409`, `413`, `415`, повреждённый JSON, неверную схему успешного ответа и `Idempotency-Replayed: true`.

```ts
test("sends the exact vendor multipart contract", async () => {
  const receipt = await sendToCrm(envelope, crmConfig, recordingFetch);
  assert.equal(recorded.method, "POST");
  assert.equal(recorded.headers.authorization, `Bearer ${crmConfig.token}`);
  assert.equal(recorded.headers["idempotency-key"], envelope.leadId);
  assert.equal(recorded.headers["x-request-id"], envelope.jobId);
  assert.deepEqual(recorded.formNames.sort(), ["description", "file", "name", "phone"]);
  assert.equal(receipt.taskCode, "WEB-42");
});
```

- [ ] **Шаг 2: Написать падающие тесты SMTP и повторов**

Через внедрённый transport Nodemailer проверить получателя `team@korotkov.dev`, отправителя из конфигурации, тему `Новая заявка KorDevTeam · <последние 8 символов ID>`, детерминированный Message-ID `<lead-<uuid>@kordev.team>`, русское текстовое тело, очищенное имя файла и отсутствие исходного IP, HMAC и токена поставщика. Убедиться, что ошибки SMTP 4xx/сети повторяются, а ошибки аутентификации, конфигурации и получателя 5xx переходят в ручное действие.

```ts
test("email uses a deterministic identity and one private attachment", async () => {
  await sendLeadEmail(envelope, smtpConfig, recordingTransport);
  assert.equal(recordedMail.to, "team@korotkov.dev");
  assert.equal(recordedMail.messageId, `<lead-${envelope.leadId}@kordev.team>`);
  assert.equal(recordedMail.attachments.length, 1);
  assert.equal(recordedMail.attachments[0].path, envelope.attachment?.path);
});
```

- [ ] **Шаг 3: Запустить тесты и подтвердить отсутствие адаптеров**

Команда: `yarn tsx --test src/server/leads/crm.test.ts src/server/leads/email.test.ts src/server/leads/retry.test.ts`

Ожидается: FAIL, потому что три модуля отсутствуют.

- [ ] **Шаг 4: Реализовать потоковую multipart-доставку в CRM**

Материализовать приватный объект во временный файл worker с правами `0600`, открыть через Node 22 `openAsBlob(path, { type })`, один раз добавить в нативный `FormData` и удалить временный файл в `finally`. Отправлять с `AbortSignal.timeout(15_000)` и никогда не задавать multipart `Content-Type` вручную. Валидировать успех строгой схемой Zod и обрабатывать `X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` и `Idempotency-Replayed`, не журналируя исходные тела ответов.

```ts
const form = new FormData();
form.set("name", envelope.name);
form.set("phone", envelope.phone);
if (envelope.description) form.set("description", envelope.description);
if (envelope.attachment) {
  form.set("file", await openAsBlob(envelope.attachment.path, { type: envelope.attachment.mediaType }), envelope.attachment.originalName);
}
const response = await fetchImpl(config.endpoint, {
  method: "POST",
  headers: { Authorization: `Bearer ${config.token}`, "Idempotency-Key": envelope.leadId, "X-Request-Id": envelope.jobId },
  body: form,
  signal: AbortSignal.timeout(15_000),
});
```

Классифицировать `idempotency_in_progress` как повтор; `configuration_invalid` и `idempotency_conflict` — как ручное действие; сеть/timeout/429/5xx — как повтор; остальные документированные ошибки 400/401/403/413/415 — как terminal/manual action без изменения тела или ключа.

- [ ] **Шаг 5: Реализовать SMTP-доставку и расписание повторов**

Создать один transporter Nodemailer из `SMTP_*`. Отправлять обычный текст и путь одного вложения при его наличии. Email-канал использует экспоненциальную задержку от одной минуты с максимумом шесть часов и детерминированным jitter в тестах, переходя в `manual_action` после 12 неудачных отправок. Задержки CRM учитывают корректный `Retry-After` от 1 до 3600 секунд либо используют экспоненциальную задержку от одной секунды; не допускать следующую попытку CRM в момент `acceptedAt + 23h55m` или позже.

```ts
const CRM_CUTOFF_MS = 23 * 60 * 60 * 1000 + 55 * 60 * 1000;
const EMAIL_MAX_ATTEMPTS = 12;
await transport.sendMail({
  from: config.from,
  to: config.to,
  subject: `Новая заявка KorDevTeam · ${envelope.leadId.slice(-8)}`,
  messageId: `<lead-${envelope.leadId}@kordev.team>`,
  text: renderLeadText(envelope),
  attachments: envelope.attachment ? [{ filename: envelope.attachment.originalName, path: envelope.attachment.path, contentType: envelope.attachment.mediaType }] : [],
});
```

- [ ] **Шаг 6: Обеспечить прохождение контрактных тестов адаптеров**

Команда: `yarn tsx --test src/server/leads/crm.test.ts src/server/leads/email.test.ts src/server/leads/retry.test.ts`

Ожидается: проходят все классификации ответов, стабильные заголовки, multipart-поля, содержимое email и граничные значения прекращения повторов.

- [ ] **Шаг 7: Зафиксировать срез адаптеров доставки коммитом**

```bash
git add src/server/leads/crm.ts src/server/leads/email.ts src/server/leads/retry.ts src/server/leads/crm.test.ts src/server/leads/email.test.ts src/server/leads/retry.test.ts
git commit -m "feat(leads): deliver to CRM and email"
```

---

### Задача 8: Запустить один устойчивый к сбоям outbox-worker из production-образа

**Файлы:**

- Создать: `src/server/leads/worker.ts`
- Создать: `src/server/leads/worker.test.ts`
- Создать: `server/lead-worker.mjs`
- Изменить: `src/entry.server.tsx`
- Изменить: `package.json`

**Интерфейсы:**

- Использует: методы получения/обновления репозитория, адаптеры CRM/email, политику повторов и материализацию приватного объекта.
- Создаёт: `runLeadWorker(options): Promise<void>`, `runWorkerBatch(options): Promise<number>` и `checkLeadWorkerReady(): Promise<void>`.
- Создаёт: `node server/lead-worker.mjs` и `node server/lead-worker.mjs --check`.

- [ ] **Шаг 1: Написать падающие тесты worker**

```ts
test("one channel failure does not suppress the other channel", async () => {
  const processed = await runWorkerBatch(fixtureWithCrmRetryAndEmailSuccess);
  assert.equal(processed, 2);
  assert.equal(repository.state("crm"), "retry");
  assert.equal(repository.state("email"), "delivered");
});
```

Добавить тесты, подтверждающие, что два worker не доставляют одну действующую аренду; просроченная аренда восстанавливается; метаданные доставки очищаются; исчерпание лимита токена CRM переносит задание без вызова поставщика; 24-часовая граница CRM переводит задание в `manual_action`; лимит попыток SMTP соблюдается; материализация S3 очищается; остановка выполняется корректно; `--check` ничего не доставляет.

- [ ] **Шаг 2: Запустить тесты и подтвердить отсутствие worker**

Команда: `yarn tsx --test src/server/leads/worker.test.ts`

Ожидается: FAIL, потому что функции worker отсутствуют.

- [ ] **Шаг 3: Реализовать один ограниченный цикл worker**

```ts
export async function runWorkerBatch({ repository, crm, email, store, ownerId, batchSize = 10, clock }: WorkerOptions) {
  const jobs = await repository.claimDueJobs(ownerId, batchSize, 120_000);
  for (const job of jobs) {
    await processClaimedJob(job, { repository, crm, email, store, clock });
  }
  return jobs.length;
}
```

`WorkerOptions` содержит `LeadRepository`, функции отправки CRM/email, `PrivateAttachmentStore`, UUID `ownerId`, `batchSize`, внедрённые часы/источник случайности и необязательный `AbortSignal`. Долгоживущая обёртка добавляет к `runWorkerBatch` только опрос и обработку сигналов.

Перед каждой отправкой в CRM резервировать общий token bucket. Если он исчерпан, переносить задание к концу окна, не увеличивая счётчик ошибки поставщика. Материализовать вложение только для текущего задания и удалять его в `finally`. Сохранять только ограниченные поля квитанции или очищенные коды. При простое опрашивать раз в секунду, принимать `AbortSignal`, прекращать получение заданий по SIGTERM/SIGINT и перед выходом дать текущим ограниченным отправкам завершиться.

- [ ] **Шаг 4: Экспортировать и создать production-точку входа**

Экспортировать фабрику worker/readiness из `src/entry.server.tsx`. `server/lead-worker.mjs` импортирует `../build/server/index.js`, поддерживает только запуск без аргумента или с `--check`, создаёт один UUID процесса и завершается с ненулевым кодом и очищенной строкой при ошибке конфигурации/БД. Добавить команды:

```json
{
  "lead:worker": "node server/lead-worker.mjs",
  "lead:worker:check": "node server/lead-worker.mjs --check"
}
```

- [ ] **Шаг 5: Обеспечить прохождение unit-, build- и entrypoint-проверок**

Команда: `yarn typecheck && yarn build && yarn tsx --test src/server/leads/worker.test.ts && NODE_ENV=test DATABASE_URL="$TEST_DATABASE_URL" yarn lead:worker:check`

Ожидается: тесты и build проходят, команда проверки завершается с кодом `0`, не создавая и не доставляя заявку.

- [ ] **Шаг 6: Зафиксировать срез worker коммитом**

```bash
git add src/server/leads/worker.ts src/server/leads/worker.test.ts server/lead-worker.mjs src/entry.server.tsx package.json
git commit -m "feat(leads): process outbox with leased worker"
```

---

### Задача 9: Безопасно удалять просроченные копии сайта и старые бесхозные объекты

**Файлы:**

- Создать: `src/server/leads/retention.ts`
- Создать: `src/server/leads/retention.test.ts`
- Создать: `server/lead-retention.mjs`
- Изменить: `src/entry.server.tsx`
- Изменить: `package.json`
- Создать: `deploy/systemd/kordevteam-lead-retention.service`
- Создать: `deploy/systemd/kordevteam-lead-retention.timer`

**Интерфейсы:**

- Использует: методы репозитория для истечения срока/ссылок на объекты и операции delete/list приватного хранилища.
- Создаёт: `runLeadRetention({ limit: 100 }): Promise<RetentionReport>`.
- Создаёт: конечную команду `node server/lead-retention.mjs`.

- [ ] **Шаг 1: Написать падающие тесты порядка retention**

Подтвердить, что удаление объекта вложения завершается до удаления строки; сбой S3 сохраняет заявку для следующего запуска; `NoSuchKey` разрешает удалить строку; заявка без файла удаляется напрямую; выбираются только строки с `expiresAt <= now`; один запуск ограничен 100 строками; бесхозные ключи младше двух часов и ключи со ссылками в PostgreSQL остаются нетронутыми.

```ts
test("never deletes the row before its private object", async () => {
  const events: string[] = [];
  const report = await runLeadRetention(retentionFixture(events));
  assert.deepEqual(events, ["store.delete:private/a.pdf", "repository.delete:lead-a"]);
  assert.deepEqual(report, { deletedLeads: 1, deletedObjects: 1, deletedOrphans: 0, failures: 0 });
});

test("storage failure preserves the database row", async () => {
  const fixture = retentionFixture([], { deleteError: new Error("s3_down") });
  const report = await runLeadRetention(fixture);
  assert.equal(report.failures, 1);
  assert.equal(fixture.repository.deletedLeadIds.length, 0);
});
```

- [ ] **Шаг 2: Запустить тест и подтвердить отсутствие retention**

Команда: `yarn tsx --test src/server/leads/retention.test.ts`

Ожидается: FAIL, потому что `runLeadRetention` отсутствует.

- [ ] **Шаг 3: Реализовать ограниченный retention и очистку бесхозных объектов**

```ts
for (const lead of await repository.findExpiredLeads(limit)) {
  if (lead.objectKey) await store.deleteForRetention(lead.objectKey);
  await repository.deleteLeadAfterObject(lead.id);
}
```

После просроченных строк постранично обходить только настроенный приватный prefix и удалять объект, только если он старше двух часов и `attachmentKeyExists(key)` возвращает false. Журналировать только количества и непрозрачные ID. После сбоя хранилища на отдельной записи продолжать остальные, возвращать число ошибок и завершать команду с ненулевым кодом, если хотя бы одно удаление не удалось.

- [ ] **Шаг 4: Добавить ежедневный production-таймер**

Сервис запускается от отдельного непривилегированного операционного пользователя и вызывает:

```bash
docker compose -f /opt/kordevteam/current/deploy/docker-compose.team.yml run --rm --no-deps lead-worker node server/lead-retention.mjs
```

Unit задаёт `User=kordevteam`, `WorkingDirectory=/opt/kordevteam/current` и `EnvironmentFile=/etc/kordevteam/operations.env`. Таймер использует `OnCalendar=*-*-* 03:30:00 Europe/Moscow`, `Persistent=true` и `RandomizedDelaySec=15m`. Добавить `lead:retention` в `package.json`.

- [ ] **Шаг 5: Обеспечить прохождение тестов retention и синтаксиса systemd**

Команда: `yarn tsx --test src/server/leads/retention.test.ts && systemd-analyze verify deploy/systemd/kordevteam-lead-retention.service deploy/systemd/kordevteam-lead-retention.timer`

Ожидается: тесты retention проходят; systemd units проверяются в Linux. На macOS команду `systemd-analyze` выполняет CI, а локальный запуск отмечается как пропущенный из-за платформы, а не как успешный.

- [ ] **Шаг 6: Зафиксировать срез retention коммитом**

```bash
git add src/server/leads/retention.ts src/server/leads/retention.test.ts server/lead-retention.mjs src/entry.server.tsx package.json deploy/systemd/kordevteam-lead-retention.service deploy/systemd/kordevteam-lead-retention.timer
git commit -m "feat(leads): expire private lead copies"
```

---

### Задача 10: Создать переиспользуемую доступную форму и исправить черновик политики

**Файлы:**

- Создать: `src/components/LeadForm.tsx`
- Создать: `src/components/LeadForm.test.tsx`
- Изменить: `src/components/Contact.tsx`
- Изменить: `src/locales/ru.json`
- Изменить: `src/routes/legal.tsx`
- Изменить: `tests/ssr/frameworkBoot.test.ts`

**Интерфейсы:**

- Использует: публичный контракт `POST /api/leads`.
- Создаёт: `LeadForm({ pagePath?, className? })`, переиспользуемую в секции контактов главной и на будущих коммерческих страницах.
- Сохраняет: существующие способы связи, тёмную/светлую тему, обычные анимации и поведение reduced motion.

- [ ] **Шаг 1: Написать падающие тесты браузерного компонента**

Настроить jsdom и Testing Library. Проверить подписанные обязательные name/phone/consent, необязательные description/file, точные расширения `accept`, русские inline-ошибки/live region, отправку клавиатурой, один выполняющийся запрос после двойного клика и повторную доступность кнопки после ошибки. Перехватывать fetch-запросы и проверять нативный multipart, один UUID-заголовок, тот же UUID для неизменённого повтора, новый UUID после изменения любого поля/файла, отсутствие вручную заданного `Content-Type` и успех только для `200`/`201` с корректным `leadId`.

```tsx
test("submits only the approved visible fields and site consent", async () => {
  render(<LeadForm pagePath="/" />);
  await user.type(screen.getByLabelText("Имя"), "Анна");
  await user.type(screen.getByLabelText("Телефон"), "+7 999 111-22-33");
  await user.click(screen.getByLabelText(/согласен/i));
  await user.click(screen.getByRole("button", { name: "Отправить заявку" }));
  assert.deepEqual([...capturedFormData.keys()].sort(), ["consent", "description", "name", "pagePath", "phone", "website"]);
});
```

- [ ] **Шаг 2: Запустить тесты и подтвердить отсутствие компонента**

Команда: `yarn tsx --test src/components/LeadForm.test.tsx`

Ожидается: FAIL, потому что `LeadForm` не существует.

- [ ] **Шаг 3: Реализовать поведение формы и тексты**

Использовать нативные семантические `<form>`, `<label>`, input, textarea, файловый input и checkbox; переиспользовать существующие `Input`, `Textarea` и `Button` там, где семантика остаётся нативной. Добавить `aria-invalid`, `aria-describedby`, фокусировать первое неверное поле и объявлять состояние запроса через `role="status" aria-live="polite"`. Показывать «Ответим в течение рабочего дня» и «Пн–Пт, 09:00–18:00 по Москве».

Хранить hash снимка и UUID в ref. Повторно использовать UUID, только когда нормализованные поля и name/size/lastModified файла не изменились после сетевого/временного ответа; сбрасывать его при любом редактировании после попытки и после успеха. Никогда не сохранять name, phone, description, file или UUID в localStorage/sessionStorage.

```tsx
const submission = sameSnapshot(retryRef.current, snapshot)
  ? retryRef.current
  : { key: crypto.randomUUID(), snapshot };
retryRef.current = submission;
const response = await fetch("/api/leads", {
  method: "POST",
  headers: { "Idempotency-Key": submission.key },
  body: formData,
});
const body = await response.json();
if (![200, 201].includes(response.status) || !UUID_PATTERN.test(body.leadId)) throw publicLeadError(response.status, body);
```

- [ ] **Шаг 4: Встроить форму без удаления ссылок для связи**

Изменить `Contact` на адаптивную двухколоночную компоновку: карточки связи остаются в одной колонке, `LeadForm` занимает другую. Сохранить `id="contact"`, существующие анимации и одноколоночный порядок на мобильных. Убедиться, что SSR HTML содержит форму, ссылку согласия `/privacy/`, текст рабочих часов и не содержит скрытых input для email/company/service/budget.

- [ ] **Шаг 5: Обновить черновик политики для проверки владельцем**

Заменить устаревшую формулировку «один контакт/company/service/budget» на имя, обязательный телефон, необязательное описание и один необязательный файл. Указать Kusidis/Krasotula CRM, доставку по email на `team@korotkov.dev`, приватное объектное хранилище Timeweb, антивирусную обработку ClamAV и автоматическое хранение сайта 30 дней. Сохранить существующий комментарий о необходимости проверки владельцем/юристом; не заявлять о юридическом утверждении.

- [ ] **Шаг 6: Обеспечить прохождение проверок компонента, SSR и доступности**

Команда: `yarn tsx --test src/components/LeadForm.test.tsx tests/ssr/frameworkBoot.test.ts && yarn typecheck && yarn build`

Ожидается: взаимодействия компонента проходят, SSR HTML главной содержит полную русскую форму до гидратации.

- [ ] **Шаг 7: Зафиксировать срез публичной формы коммитом**

```bash
git add src/components/LeadForm.tsx src/components/LeadForm.test.tsx src/components/Contact.tsx src/locales/ru.json src/routes/legal.tsx tests/ssr/frameworkBoot.test.ts
git commit -m "feat(leads): add accessible request form"
```

---

### Задача 11: Настроить один worker, ClamAV, приватные параметры и проверки релиза

**Файлы:**

- Изменить: `Dockerfile`
- Изменить: `docker-compose.yml`
- Изменить: `deploy/docker-compose.team.yml`
- Изменить: `scripts/deploy-common.sh`
- Изменить: `scripts/deploy-slot.sh`
- Изменить: `scripts/switch-slot.sh`
- Изменить: `scripts/rollback-slot.sh`
- Изменить: `tests/deploy/image.test.mjs`
- Создать: `tests/deploy/leads.test.mjs`
- Изменить: `tests/deploy/scripts.test.mjs`
- Изменить: `tests/postgresCompose.test.ts`
- Создать: `tests/fixtures/deploy-leads.env`
- Изменить: `.github/workflows/docker-build.yml`
- Изменить: `server/.env.example`
- Изменить: `server/README.md`
- Изменить: `deploy/README.md`

**Интерфейсы:**

- Использует: готовые экспорты маршрутизатора, worker и очистки, а также все production-переменные, определённые в задаче 1.
- Создаёт: ровно один сервис `lead-worker` и один внутренний сервис `clamav`.
- Создаёт: проверку конфигурации worker из неактивного образа до переключения трафика и синхронизацию образа worker после успешного переключения или отката.

- [ ] **Шаг 1: Написать падающие тесты топологии и скриптов релиза**

Разобрать оба Compose-файла и проверить: worker только один; порты worker, ClamAV и базы данных не опубликованы; worker и оба web-слота получают только серверные настройки заявок; приватные переменные S3 отделены от переменных публичных медиафайлов; для web и worker задан ограниченный `/tmp`; ClamAV доступен только во внутренней сети и исправен; worker заменяет HTTP healthcheck образа командой `node server/lead-worker.mjs --check`; production не запускается без переменных CRM, SMTP, S3, ClamAV, HMAC и версии согласия; журналы ротируются по существующей политике.

Расширить фикстуры скриптов и проверить, что развёртывание неактивного слота запускает `lead-worker.mjs --check` из образа-кандидата до объявления готовности; успешное переключение перезапускает единственный worker с новым активным неизменяемым образом; неудачная публичная smoke-проверка не затрагивает старый worker; откат восстанавливает ранее записанный образ.

```js
test("production topology has one private lead worker", () => {
  const { services } = productionComposeFixture();
  assert.ok(services["lead-worker"]);
  assert.equal(services["lead-worker"].ports, undefined);
  assert.equal(services.clamav.ports, undefined);
  assert.deepEqual(services["lead-worker"].networks, { backend: null });
  assert.deepEqual(services["lead-worker"].command, ["node", "server/lead-worker.mjs"]);
});
```

- [ ] **Шаг 2: Запустить тесты развёртывания и подтвердить отсутствие требуемой топологии**

Запустить: `node --test tests/deploy/leads.test.mjs tests/deploy/image.test.mjs tests/deploy/scripts.test.mjs && yarn tsx --test tests/postgresCompose.test.ts`

Ожидается: FAIL, потому что worker, ClamAV, конфигурация и синхронизация скриптов ещё отсутствуют.

- [ ] **Шаг 3: Добавить локальные и production-сервисы**

В production использовать `CLAMAV_IMAGE` как задаваемый оператором неизменяемый digest, а в корневом Compose — документированный тег для локальной разработки. Выделить ClamAV отдельный том для баз сигнатур и подключить только к внутренней backend-сети. Смонтировать `tmpfs`, достаточный для одного файла размером 25 МиБ и ограниченных копий multipart/worker; сохранить `no-new-privileges` и отключённые capabilities.

Определить `lead-worker` в единственном экземпляре с `WORKER_IMAGE`, теми же `DATABASE_URL`, секретами заявок и backend-сетью, что и web, командой `node server/lead-worker.mjs`, политикой перезапуска, одной репликой по топологии и собственным командным healthcheck. Не подключать proxy-сеть и не публиковать порт.

```yaml
lead-worker:
  image: ${WORKER_IMAGE:?Provide immutable WORKER_IMAGE}
  command: [node, server/lead-worker.mjs]
  restart: unless-stopped
  networks: [backend]
  tmpfs: [/tmp:size=96m,mode=1777]
  healthcheck:
    test: [CMD, node, server/lead-worker.mjs, --check]
    interval: 30s
    timeout: 10s
    retries: 3
```

- [ ] **Шаг 4: Атомарно синхронизировать образ worker с релизами**

Во время выполнения `deploy-slot.sh` установить `WORKER_IMAGE` в записанный активный образ, чтобы интерполяция Compose была полной, затем после миграций и до успешной проверки готовности неактивного слота выполнить для образа-кандидата `node server/lead-worker.mjs --check`. В `switch-slot.sh` сначала переключить трафик и завершить публичную smoke-проверку, затем пересоздать `lead-worker` с записанным неизменяемым образом целевого слота и проверить его состояние; если замена worker завершится неудачно, восстановить прежний маршрут и прежний образ worker. В `rollback-slot.sh` безопасно выполнить обратную последовательность. Хранить состояние образа worker в существующем защищённом каталоге развёртывания.

```bash
previous_worker_image="$(recorded_image "$previous")"
export WORKER_IMAGE="$(recorded_image "$target")"
if ! docker compose -f "$COMPOSE_FILE" up -d --no-deps lead-worker || ! verify_worker "$WORKER_IMAGE"; then
  export WORKER_IMAGE="$previous_worker_image"
  docker compose -f "$COMPOSE_FILE" up -d --no-deps lead-worker
  rollback_snapshot_locked "$snapshot"
  fail 'Worker activation failed; route and worker restored'
fi
```

- [ ] **Шаг 5: Добавить проверки CI и документацию для оператора**

В CI использовать тестовые и локальные адаптеры: запускать модульные и контрактные тесты без реальных учётных данных, собирать образ и применять работающие внутри процесса заглушки ClamAV, CRM, SMTP и S3 для интеграционных тестов; реальный endpoint CRM в CI не задавать. Документировать точный набор переменных, политику приватного бакета, endpoint Timeweb, ресурсы ClamAV, настройку SMTP, изменение версии согласия, состояние worker, диагностику ручных действий, ежедневную очистку и явное правило отсутствия изменений данных при проверке готовности.

Создать `tests/fixtures/deploy-leads.env` с предназначенными только для тестов endpoint на домене `.invalid` и похожими на неизменяемые тестовыми образами, чтобы результат рендеринга Compose был воспроизводимым:

```dotenv
BLUE_IMAGE=ghcr.io/example/kordevteam:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
GREEN_IMAGE=ghcr.io/example/kordevteam:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
WORKER_IMAGE=ghcr.io/example/kordevteam:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
CLAMAV_IMAGE=clamav/clamav@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
DATABASE_URL=postgresql://fixture:fixture@postgres:5432/kordev
POSTGRES_USER=fixture
POSTGRES_PASSWORD=fixture-password
POSTGRES_DB=kordev
ADMIN_USER=owner
ADMIN_PASSWORD=fixture-admin-password
ADMIN_TOKEN=fixture-admin-token
LEAD_CONSENT_VERSION=2026-09-14
LEAD_HASH_KEY=ZmFrZS1vbmx5LTMyaXRlLWhhc2gta2V5LWZvci1jb21wb3NlLXRlc3Rz
LEAD_TEMP_ROOT=/tmp/kordev-leads
LEAD_S3_ENDPOINT=https://s3.example.invalid
LEAD_S3_REGION=ru-1
LEAD_S3_BUCKET=kordev-private-fixture
LEAD_S3_ACCESS_KEY_ID=fixture-access
LEAD_S3_SECRET_ACCESS_KEY=fixture-secret
LEAD_S3_PREFIX=leads/
LEAD_S3_SSE=AES256
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
CRM_INTAKE_ENDPOINT=https://crm.example.invalid/api/v1/board-intake/brd_fixture/requests
CRM_INTAKE_TOKEN=fixture-board-token
SMTP_HOST=smtp.example.invalid
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=fixture-user
SMTP_PASSWORD=fixture-password
SMTP_FROM=team@korotkov.dev
LEAD_EMAIL_TO=team@korotkov.dev
```

Документировать следующие production-переменные:

```text
LEAD_CONSENT_VERSION LEAD_HASH_KEY LEAD_TEMP_ROOT
LEAD_S3_ENDPOINT LEAD_S3_REGION LEAD_S3_BUCKET LEAD_S3_ACCESS_KEY_ID
LEAD_S3_SECRET_ACCESS_KEY LEAD_S3_PREFIX LEAD_S3_SSE
CLAMAV_HOST CLAMAV_PORT
CRM_INTAKE_ENDPOINT CRM_INTAKE_TOKEN
SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD SMTP_FROM
LEAD_EMAIL_TO WORKER_IMAGE CLAMAV_IMAGE
```

- [ ] **Шаг 6: Добиться прохождения тестов топологии, скриптов, образа и Compose**

Запустить:

```bash
node --test tests/deploy/leads.test.mjs tests/deploy/image.test.mjs tests/deploy/scripts.test.mjs
yarn tsx --test tests/postgresCompose.test.ts
docker compose config --quiet
docker compose --env-file tests/fixtures/deploy-leads.env -f deploy/docker-compose.team.yml config --quiet
bash -n scripts/deploy-common.sh scripts/deploy-slot.sh scripts/switch-slot.sh scripts/rollback-slot.sh
```

Ожидается: каждая команда завершается с кодом `0`; production Compose содержит один приватный worker и не открывает новых портов.

- [ ] **Шаг 7: Зафиксировать коммитом изменения runtime и развёртывания**

```bash
git add Dockerfile docker-compose.yml deploy/docker-compose.team.yml scripts/deploy-common.sh scripts/deploy-slot.sh scripts/switch-slot.sh scripts/rollback-slot.sh tests/deploy/image.test.mjs tests/deploy/leads.test.mjs tests/deploy/scripts.test.mjs tests/postgresCompose.test.ts tests/fixtures/deploy-leads.env .github/workflows/docker-build.yml server/.env.example server/README.md deploy/README.md
git commit -m "feat(deploy): operate durable lead delivery"
```

---

### Задача 12: Выполнить полную локальную проверку релиза и зафиксировать результаты

**Файлы:**

- Создать: `tests/leads/endToEnd.test.ts`
- Изменять остальные файлы только в том случае, если интеграционный тест выявит дефект в файле из задач 1–11.

**Интерфейсы:**

- Использует: результаты всех предыдущих задач.
- Создаёт: актуальные подтверждения того, что весь сайт, миграция, форма, worker и топология развёртывания работают совместно без обращения к production-сервисам.

- [ ] **Шаг 1: Запустить чистую тестовую инфраструктуру и применить миграции**

Запустить:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn db:migrate
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn db:check
```

Ожидается: PostgreSQL исправен, миграции завершены, проверка Drizzle завершается с кодом `0`.

- [ ] **Шаг 2: Выполнить статические и автоматизированные проверки**

Запустить:

```bash
yarn typecheck
TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn test
yarn build
```

Ожидается: проверка типов, все существующие и новые тесты, а также production-сборка проходят без ошибок. Пропуск разрешён только для теста, явно защищённого проверкой недоступного платформенного инструмента; интеграционные тесты PostgreSQL должны выполняться, а не пропускаться.

- [ ] **Шаг 3: Добавить и запустить сквозной тест с тестовыми зависимостями**

В `tests/leads/endToEnd.test.ts` запустить Express с настоящими маршрутизатором, сервисом и репозиторием заявок на тестовой базе данных и внедрить записывающие адаптеры ClamAV, приватного хранилища, CRM и SMTP. Отправить одну заявку без файла и одну заявку с безопасным файлом, повторить первый запрос с исходным ключом браузера, запускать пакеты worker до полного завершения заданий и проверить:

```ts
test("two accepted leads deliver once to both channels", async () => {
  const first = await fixture.submit(noFileForm, firstBrowserKey);
  const replay = await fixture.submit(noFileForm, firstBrowserKey);
  const second = await fixture.submit(cleanFileForm, secondBrowserKey);
  assert.deepEqual([first.status, replay.status, second.status], [201, 200, 201]);
  while (await fixture.worker.runBatch()) continue;
  assert.deepEqual(await fixture.counts(), { leads: 2, jobs: 4, crmTasks: 2, emails: 2, objects: 1, dueJobs: 0 });
  assert.equal(fixture.logsContainContactsOrSecrets(), false);
});
```

Проверить в PostgreSQL и записях тестовых адаптеров:

```text
2 заявки
4 задания outbox
2 задачи CRM; повторный запрос не создаёт третью задачу
2 email-сообщения
1 приватный объект вложения
0 ожидающих или повторяемых заданий
0 контактных данных или секретов в журналах runtime
```

Запустить: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test tests/leads/endToEnd.test.ts`

Ожидается: один интеграционный тест проходит с точными количествами, указанными выше, без внешних сетевых запросов.

- [ ] **Шаг 4: Проверить сбой и восстановление**

Добавить второй тест в тот же файл. Настроить записывающий адаптер CRM на возврат допускающей повтор ошибки `500`, убедиться, что публичная отправка всё равно возвращает `201`, создать новый экземпляр worker с истёкшей арендой, восстановить ответ CRM `201` и подтвердить, что обе записанные попытки использовали одинаковые UUID заявки и контрольную сумму вложения, а тестовая CRM содержит одну логическую задачу. Имитировать сбой удаления из S3 во время очистки и убедиться, что строка базы данных сохраняется; восстановить удаление, перевести внедрённые часы на 30 дней вперёд и подтвердить, что объект удаляется раньше строки.

```ts
test("accepted work survives vendor failure, worker restart, and retention retry", async () => {
  const accepted = await fixture.submit(cleanFileForm);
  assert.equal(accepted.status, 201);
  await fixture.worker.runBatch();
  fixture.clock.advance(121_000);
  fixture.crm.recover();
  await fixture.newWorker().runBatch();
  assert.equal(new Set(fixture.crm.attempts.map((attempt) => attempt.idempotencyKey)).size, 1);
  fixture.clock.advance(30 * 86_400_000);
  fixture.store.failNextDelete();
  assert.equal((await fixture.retention.run()).failures, 1);
  assert.equal(await fixture.repository.hasLead(accepted.leadId), true);
  assert.equal((await fixture.retention.run()).failures, 0);
  assert.equal(await fixture.repository.hasLead(accepted.leadId), false);
});
```

Запустить: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test tests/leads/endToEnd.test.ts`

Ожидается: оба сквозных теста проходят.

- [ ] **Шаг 5: Запустить регрессионные проверки краулера и развёртывания**

Запустить:

```bash
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn content:migrate --batch-id "lead-intake-verification"
lead_runtime_log="$(mktemp)"
NODE_ENV=test DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn start >"$lead_runtime_log" 2>&1 &
lead_runtime_pid=$!
for lead_ready_attempt in $(seq 1 30); do curl --fail --silent http://127.0.0.1:3001/api/health/ready >/dev/null && break; sleep 1; done
yarn seo:crawl --origin http://127.0.0.1:3001
kill "$lead_runtime_pid"
wait "$lead_runtime_pid" 2>/dev/null || true
node --test tests/deploy/*.test.mjs tests/ciReleaseGate.test.mjs
git diff --check
```

Ожидается: краулер не сообщает о нарушениях маршрутов и SEO, временный runtime остановлен, тесты развёртывания проходят, а `git diff --check` не выводит ошибок.

- [ ] **Шаг 6: Зафиксировать коммитом сквозной проверочный тест и подтверждённые исправления**

```bash
git add tests/leads/endToEnd.test.ts
git add src/server/leads src/components/LeadForm.tsx server deploy scripts package.json yarn.lock
git diff --cached --check
git commit -m "test(leads): verify durable delivery recovery"
```

Перед вторым `git add` проверить `git status --short` и включить только файлы, изменённые для исправления сбоев, подтверждённых на шагах 2–5; не добавлять в индекс несвязанные изменения владельца репозитория.

- [ ] **Шаг 7: Проверить состав изменений и состояние репозитория**

Запустить: `git status --short && git log --oneline --decorate -12`

Ожидается: незакоммиченных файлов нет, история состоит из перечисленных выше сфокусированных коммитов, коммиты слияния, push или развёртывания отсутствуют. Подтвердить, что в журналах и тестовой конфигурации нет реальных запросов к CRM, SMTP или S3.
