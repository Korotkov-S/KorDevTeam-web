# KorDevTeam Durable Lead Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable Russian lead form that durably stores an accepted request in PostgreSQL and then delivers it independently to Kusidis/Krasotula CRM and `team@korotkov.dev`, including one safely scanned private attachment.

**Architecture:** The React form posts streaming multipart data to an Express router exported from the React Router server bundle. A focused TypeScript lead service validates and scans the upload, stores it in a private Timeweb S3 location, and commits the lead plus two outbox jobs atomically in PostgreSQL. One separate worker from the same immutable image claims jobs with PostgreSQL leases, applies the supplied CRM contract and SMTP policy, while a daily command removes 30-day site copies.

**Tech Stack:** Node 22.22, React 18, React Router 7.9.4, Express 5, TypeScript 5.9, PostgreSQL 16, Drizzle ORM/Kit, Busboy, Nodemailer, yauzl, AWS SDK v3, ClamAV INSTREAM, Node test runner, Testing Library, Docker Compose, systemd.

**Spec:** `docs/superpowers/specs/2026-09-14-kordev-lead-intake-design.md`

## Global Constraints

- Keep Node `22.22.0`, React `18.3.1`, React Router `7.9.4`, Vite `6.3.5`, PostgreSQL `16`, and the current light/dark visual direction.
- The public fields are exactly required `name`, required `phone`, optional `description`, optional one `file`, and required site-only `consent`; do not add email, company, service, or budget.
- Accept one file up to exactly `26_214_400` bytes: PDF, DOC, DOCX, XLS, XLSX, JPG/JPEG, or PNG with matching extension, declared MIME, and inspected content.
- Keep CRM endpoint/token, SMTP credentials, private S3 credentials, ClamAV address, and HMAC key server-only.
- A public success means the local lead, consent evidence, attachment metadata, and both outbox jobs are durable; it does not mean CRM or SMTP has already succeeded.
- Use one stable browser UUID per unchanged browser retry and a separate immutable lead UUID as the CRM `Idempotency-Key`.
- CRM retries reuse identical fields and file bytes, stop before its 24-hour idempotency record expires, and remain below 20 modifying requests per minute per token.
- Store no raw client IP. Retain the site-owned lead and private object for exactly 30 days, then delete the object before the database row.
- Use honeypot plus rate limits without CAPTCHA. Do not emit an analytics success for ignored honeypot requests.
- Ordinary motion remains; `MotionConfig reducedMotion="user"` continues to honor `prefers-reduced-motion`.
- Tests and deployment readiness must not contact real CRM, SMTP, or production S3 and must not insert a production smoke lead unless an operator explicitly enables it.
- Do not push, deploy, or switch production as part of implementation without a new explicit owner request.

---

## File structure locked by this plan

Create:

- `src/server/leads/contracts.ts` — constants, normalized input, public response, job, and adapter types.
- `src/server/leads/config.ts` — fail-closed web/worker environment parsing without network activity.
- `src/server/leads/errors.ts` — stable safe error codes and public status mapping.
- `src/server/leads/validation.ts` — field, phone, context, fingerprint, filename, and HMAC normalization.
- `src/server/leads/repository.ts` — PostgreSQL idempotency, rate-limit, outbox lease, and retention operations.
- `src/server/leads/multipart.ts` — bounded Busboy parsing into mode-`0600` temporary files.
- `src/server/leads/fileInspection.ts` — MIME/extension/signature, OOXML ZIP, and legacy CFB checks.
- `src/server/leads/clamav.ts` — ClamAV INSTREAM adapter.
- `src/server/leads/objectStore.ts` — private Timeweb S3 upload/materialize/delete/list adapter.
- `src/server/leads/service.ts` — acceptance orchestration and S3 compensation.
- `src/server/leads/http.ts` — same-origin HTTPS Express router and safe response mapping.
- `src/server/leads/crm.ts` — supplied Kusidis Website Intake API adapter.
- `src/server/leads/email.ts` — SMTP adapter with deterministic Message-ID.
- `src/server/leads/retry.ts` — bounded retry classification and scheduling.
- `src/server/leads/worker.ts` — leased outbox processing loop.
- `src/server/leads/retention.ts` — 30-day deletion and orphan-object sweep.
- `server/lead-worker.mjs` — production worker entrypoint importing the built server bundle.
- `server/lead-retention.mjs` — bounded daily retention entrypoint.
- `src/components/LeadForm.tsx` — reusable accessible browser form.
- `tests/fixtures/leads/clean.doc` and `tests/fixtures/leads/clean.xls` — minimal non-sensitive legacy Office containers for structural inspection tests.
- `tests/fixtures/deploy-leads.env` — fake-only values for rendering the production Compose topology in tests.
- `deploy/systemd/kordevteam-lead-retention.service` and `deploy/systemd/kordevteam-lead-retention.timer` — daily cleanup schedule.
- Focused tests beside each TypeScript server module plus `tests/ssr/leads.test.ts` and `tests/deploy/leads.test.mjs`.

Modify:

- `package.json`, `yarn.lock` — multipart, SMTP, ZIP inspection, and DOM-test dependencies and commands.
- `src/server/db/schema.ts`, `drizzle/0001_lead_intake.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0001_snapshot.json` — lead tables, enums, indexes, and constraints.
- `src/server/db/schema.test.ts` — cascade and constraint integration tests.
- `src/entry.server.tsx` — export router, readiness, worker, and retention factories to the production bundle.
- `server/api-app.js`, `server/runtime.mjs` — mount multipart before JSON parsing and use composite readiness.
- `src/components/Contact.tsx`, `src/locales/ru.json` — embed the form and Russian state/error copy.
- `src/routes/legal.tsx` — make the owner-review privacy draft match the actual fields and processors.
- `tests/ssr/support/runtime.ts` — inject safe local lead test settings.
- `Dockerfile`, `docker-compose.yml`, `deploy/docker-compose.team.yml` — writable private temp space, ClamAV, one worker, and backend-only configuration.
- `scripts/deploy-slot.sh`, `scripts/switch-slot.sh`, `scripts/rollback-slot.sh`, `scripts/deploy-common.sh` — validate the worker image/config and keep it aligned with the active release.
- `tests/deploy/readiness.test.mjs`, `tests/deploy/image.test.mjs`, `tests/deploy/scripts.test.mjs`, `tests/postgresCompose.test.ts` — deployment regression coverage.
- `server/.env.example`, `server/README.md`, `deploy/README.md`, `.github/workflows/docker-build.yml` — operator configuration and verification gates.

Do not modify the legacy SQLite lead path because none exists. Do not reuse `server/utils/s3.js`: it intentionally supports public media URLs and ACL fallback, while lead attachments require a separate fail-closed private policy.

---

### Task 1: Lock the lead contract, configuration, and pure validation

**Files:**

- Modify: `package.json`
- Modify: `yarn.lock`
- Create: `src/server/leads/contracts.ts`
- Create: `src/server/leads/config.ts`
- Create: `src/server/leads/errors.ts`
- Create: `src/server/leads/validation.ts`
- Test: `src/server/leads/validation.test.ts`
- Test: `src/server/leads/config.test.ts`

**Interfaces:**

- Produces: `MAX_FILE_BYTES = 26_214_400`, `MAX_DESCRIPTION_LENGTH = 10_000`, `CONSENT_FIELD_VALUE = "accepted"`.
- Produces: `normalizeLeadFields(raw: RawLeadFields): NormalizedLeadFields`.
- Produces: `normalizeLeadContext(raw: RawLeadContext): LeadContext`.
- Produces: `requestFingerprint(input: FingerprintInput): string` and `subjectHash(secret: string, kind: "ip" | "phone" | "crm_token", value: string): string`.
- Produces: `readLeadWebConfig(env): LeadWebConfig`, `assertLeadWebConfig(env): void`, and `readLeadWorkerConfig(env): LeadWorkerConfig`.
- Produces: `LeadError` with a fixed `code`, HTTP `status`, optional bounded `retryAfterSeconds`, and no arbitrary public message.

- [ ] **Step 1: Write failing contract and validation tests**

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

- [ ] **Step 2: Run the tests and confirm imports fail**

Run: `yarn tsx --test src/server/leads/validation.test.ts src/server/leads/config.test.ts`

Expected: FAIL because the lead modules do not exist.

- [ ] **Step 3: Install the locked runtime and test dependencies**

Run:

```bash
yarn add busboy nodemailer yauzl
yarn add --dev @types/busboy @types/nodemailer @types/yauzl @testing-library/dom @testing-library/react @testing-library/user-event @types/jsdom jsdom
```

Keep the versions resolved by Yarn in `yarn.lock`; do not change the existing Node, React, router, Vite, PostgreSQL, or Drizzle pins.

- [ ] **Step 4: Define exact types, errors, and normalization**

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

Allow only `name`, `phone`, `description`, `consent`, `website`, `pagePath`, `referrer`, `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, and `utmTerm`. Trim text, normalize CRLF to LF, cap context values at 500 characters, accept only an absolute-path `pagePath`, and reduce referrer to origin plus path. Count Unicode code points for name/description and ASCII digits for the CRM phone rule.

Use SHA-256 over canonical sorted JSON for the request fingerprint and HMAC-SHA-256 with domain prefixes for rate-limit subjects. Compare fingerprints with `timingSafeEqual` after confirming equal byte length.

- [ ] **Step 5: Parse configuration without exposing values**

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

Production requires non-empty `LEAD_CONSENT_VERSION`, base64 `LEAD_HASH_KEY` decoding to at least 32 bytes, all `LEAD_S3_*` values, `CLAMAV_HOST`, `CLAMAV_PORT`, HTTPS `CRM_INTAKE_ENDPOINT` ending in `/api/v1/board-intake/{publicId}/requests`, `CRM_INTAKE_TOKEN`, all `SMTP_*` values, and `LEAD_EMAIL_TO=team@korotkov.dev`. Development/test factories receive explicit safe values; never embed production-looking fallback secrets.

- [ ] **Step 6: Pass focused tests and typecheck**

Run: `yarn tsx --test src/server/leads/validation.test.ts src/server/leads/config.test.ts && yarn typecheck`

Expected: all focused tests PASS and typecheck exits `0`.

- [ ] **Step 7: Commit the contract slice**

```bash
git add package.json yarn.lock src/server/leads/contracts.ts src/server/leads/config.ts src/server/leads/errors.ts src/server/leads/validation.ts src/server/leads/validation.test.ts src/server/leads/config.test.ts
git commit -m "feat(leads): define intake contract and configuration"
```

---

### Task 2: Add the PostgreSQL lead, attachment, outbox, and rate-limit schema

**Files:**

- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/schema.test.ts`
- Create: `drizzle/0001_lead_intake.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0001_snapshot.json`

**Interfaces:**

- Produces: Drizzle exports `leads`, `leadAttachments`, `leadDeliveryJobs`, and `leadRateLimits`.
- Produces: enums `leadDeliveryChannel`, `leadDeliveryStatus`, and `leadRateLimitKind`.
- Preserves: existing content/admin tables and `resetTestDatabase()` behavior.

- [ ] **Step 1: Add a failing schema integration test**

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

Also test duplicate `submission_key`, duplicate `(lead_id, channel)`, more than one attachment, and negative attempt/count values.

- [ ] **Step 2: Run the schema test and confirm missing exports**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/db/schema.test.ts`

Expected: FAIL because the four lead tables are not defined.

- [ ] **Step 3: Add constrained Drizzle tables**

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

Define the remaining tables exactly from the design: attachment key/checksum/scan fields, one unique attachment per lead, one unique job per lead/channel, lease fields, bounded JSON metadata, and rate bucket composite primary key `(kind, subject_hash, window_started_at)`. Add database checks for 64-character lowercase hex hashes, positive attachment size no greater than `26_214_400`, non-negative counters, and `expires_at > accepted_at`.

- [ ] **Step 4: Generate and inspect the versioned migration**

Run: `yarn db:generate --name lead_intake && yarn db:check`

Expected: Drizzle writes `drizzle/0001_lead_intake.sql` plus its snapshot/journal entry, and `db:check` exits `0`. Inspect the SQL to confirm it only creates the three enums, four tables, their foreign keys, indexes, and checks; it must not drop or rewrite content tables.

- [ ] **Step 5: Apply twice and pass schema tests**

Run:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn db:migrate
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn db:migrate
TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/db/schema.test.ts
```

Expected: both migration commands exit `0`; every schema test passes.

- [ ] **Step 6: Commit the schema slice**

```bash
git add src/server/db/schema.ts src/server/db/schema.test.ts drizzle/0001_lead_intake.sql drizzle/meta/_journal.json drizzle/meta/0001_snapshot.json
git commit -m "feat(leads): add durable intake schema"
```

---

### Task 3: Implement transactional idempotency, rate limits, leases, and repository reads

**Files:**

- Create: `src/server/leads/repository.ts`
- Test: `src/server/leads/repository.test.ts`

**Interfaces:**

- Consumes: Task 1 normalized types and Task 2 tables.
- Produces: `createLeadRepository(db, clock): LeadRepository`.
- Produces: `findBySubmissionKey(submissionKey): Promise<StoredLead | null>` for cheap replay checks before scanning/upload.
- Produces: `consumeIpAttempt(ipHash): Promise<RateDecision>` and `accept(command): Promise<AcceptDecision>`.
- Produces: `claimDueJobs(ownerId, limit, leaseMs): Promise<ClaimedJob[]>`, `markDelivered`, `reschedule`, `markTerminal`, and `markManualAction`.
- Produces: `reserveCrmTokenAttempt(tokenHash): Promise<RateDecision>`, `findExpiredLeads(limit)`, `attachmentKeyExists(key)`, and `deleteLeadAfterObject(id)`.

- [ ] **Step 1: Write failing concurrency and atomicity tests**

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

Add cases for same submission key/different fingerprint returning `conflict`, no partial row after an injected transaction error, the sixth IP attempt returning a bounded retry time, the fourth new phone lead in one hour being rejected, the twenty-first CRM reservation in a minute being delayed, and expired leases being reclaimed by only one concurrent worker.

- [ ] **Step 2: Run the repository test and confirm it fails**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/leads/repository.test.ts`

Expected: FAIL because `createLeadRepository` is missing.

- [ ] **Step 3: Implement serialized acceptance**

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

Inside one transaction: lock the submission key, load an existing lead, compare its fingerprint with constant-time comparison, return its stored response for a replay, consume the phone bucket only for a genuinely new lead, then insert the lead, optional attachment metadata, and exactly two jobs. Set `expiresAt` from `acceptedAt + 30 * 24 * 60 * 60 * 1000` using the injected clock.

- [ ] **Step 4: Implement rate buckets and job leasing**

Use one atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE count < limit RETURNING count` per bucket. IP uses 5 attempts/30 minutes, phone uses 3 accepted leads/60 minutes, and CRM token uses 20 sends/60 seconds. Derive `retryAfterSeconds` from the exact persisted window end and cap the public value at the remaining window.

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

Claim due jobs in a transaction with `FOR UPDATE SKIP LOCKED`, change them to `processing`, increment `attempt_count`, and set a two-minute lease. Return joined immutable lead and attachment metadata, never a secret. Reclaim only `processing` jobs whose lease has expired.

- [ ] **Step 5: Pass repository integration tests**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/leads/repository.test.ts`

Expected: every concurrency, rate, transaction, and lease test passes without duplicate rows.

- [ ] **Step 6: Commit the repository slice**

```bash
git add src/server/leads/repository.ts src/server/leads/repository.test.ts
git commit -m "feat(leads): persist idempotent outbox submissions"
```

---

### Task 4: Stream multipart uploads and inspect every allowed file format

**Files:**

- Create: `src/server/leads/multipart.ts`
- Create: `src/server/leads/fileInspection.ts`
- Test: `src/server/leads/multipart.test.ts`
- Test: `src/server/leads/fileInspection.test.ts`
- Create: `tests/fixtures/leads/clean.doc`
- Create: `tests/fixtures/leads/clean.xls`

**Interfaces:**

- Consumes: `MAX_FILE_BYTES`, `MAX_MULTIPART_BYTES`, allowed fields, and `LeadError`.
- Produces: `parseLeadMultipart(request, tempRoot): Promise<ParsedLeadMultipart>`.
- Produces: `inspectAttachment(staged): Promise<VerifiedAttachment>`.
- Produces: `ParsedLeadMultipart.dispose(): Promise<void>` that is safe to call more than once.

- [ ] **Step 1: Write failing parser and content-inspection tests**

Create deterministic fixture builders for minimal PDF, JPEG, PNG, DOCX, and XLSX files and checked-in small legacy DOC/XLS fixtures. Test exact maximum size, one byte over maximum, an empty file, two files, unknown fields, a renamed PNG declared as PDF, a ZIP without `word/document.xml`, a DOC without `WordDocument`, an XLS without `Workbook`/`Book`, an encrypted ZIP flag, and parser abort cleanup.

```ts
test("streams one attachment to a private temporary file", async (t) => {
  const parsed = await parseLeadMultipart(requestWithFile(pdfFixture), tempRoot);
  t.after(() => parsed.dispose());
  assert.equal(parsed.attachment?.byteSize, pdfFixture.length);
  assert.equal((await stat(parsed.attachment!.path)).mode & 0o777, 0o600);
  assert.equal(parsed.attachment?.sha256, createHash("sha256").update(pdfFixture).digest("hex"));
});
```

- [ ] **Step 2: Run the focused tests and confirm missing modules**

Run: `yarn tsx --test src/server/leads/multipart.test.ts src/server/leads/fileInspection.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement bounded Busboy streaming**

Reject non-multipart requests and `Content-Length > MAX_MULTIPART_BYTES` before reading. Count every incoming request byte as it streams so chunked/missing/false `Content-Length` cannot exceed the same total. Configure Busboy with one file, 12 fields, 500-byte context limits, exact name/phone/description limits, and `fileSize: MAX_FILE_BYTES`. Stream the file through a SHA-256 transform into a random mode-`0600` file under `LEAD_TEMP_ROOT`; never use the user filename as a path. Abort on truncation or any parser limit and unlink every staged file in `dispose()`/error paths.

```ts
const parser = busboy({
  headers: request.headers,
  limits: { files: 1, fields: 12, parts: 13, fileSize: MAX_FILE_BYTES, fieldNameSize: 32, fieldSize: MAX_DESCRIPTION_LENGTH * 4 },
});
const objectName = `${randomUUID()}.upload`;
const output = createWriteStream(resolveInside(tempRoot, objectName), { flags: "wx", mode: 0o600 });
```

- [ ] **Step 4: Implement fail-closed content inspection**

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

Check `%PDF-` at byte zero and `%%EOF` near the end, PNG's eight-byte signature plus terminal `IEND`, JPEG SOI/EOI markers, and reject trailing second-format signatures. Open OOXML with yauzl in lazy mode, reject encrypted entries/path traversal/duplicate critical entries, cap entry count and total uncompressed size, and require `[Content_Types].xml` plus `word/document.xml` for DOCX or `xl/workbook.xml` for XLSX. Parse the CFB header, sector sizes, FAT/DIFAT chains, and directory entries with bounded reads; require `WordDocument` for DOC and `Workbook` or `Book` for XLS. Reject loops, out-of-range sectors, malformed containers, and mismatched expected streams.

- [ ] **Step 5: Pass file tests and verify no temp residue**

Run: `yarn tsx --test src/server/leads/multipart.test.ts src/server/leads/fileInspection.test.ts`

Expected: all format and cleanup tests pass; each test's temporary directory is empty after `dispose()`.

- [ ] **Step 6: Commit the upload-safety slice**

```bash
git add src/server/leads/multipart.ts src/server/leads/fileInspection.ts src/server/leads/multipart.test.ts src/server/leads/fileInspection.test.ts
git commit -m "feat(leads): validate streamed attachments"
```

---

### Task 5: Add private S3, ClamAV, and durable acceptance orchestration

**Files:**

- Create: `src/server/leads/clamav.ts`
- Create: `src/server/leads/objectStore.ts`
- Create: `src/server/leads/service.ts`
- Test: `src/server/leads/clamav.test.ts`
- Test: `src/server/leads/objectStore.test.ts`
- Test: `src/server/leads/service.test.ts`

**Interfaces:**

- Consumes: Tasks 1–4 types and `LeadRepository`.
- Produces: `ClamAvScanner.scan(path): Promise<CleanScan>`.
- Produces: `PrivateAttachmentStore.putFile`, `materialize`, `delete`, and `listOlderThan`.
- Produces: `createLeadService(dependencies).accept(input): Promise<ServiceDecision>`.

- [ ] **Step 1: Write failing adapter and service-order tests**

Use a local TCP fake that records the ClamAV `zINSTREAM\0` command, length-prefixed chunks, and zero terminator. Use an injected fake `S3Client` to assert `PutObjectCommand` has no public ACL, uses the configured private bucket/prefix, streams a file body, and supplies configured server-side encryption. Service tests must prove: replay skips scan/upload; malware/unavailable scanner creates no lead; clean file scans before upload; database failure deletes the uploaded object; a racing replay deletes its redundant object; and a durable no-file lead creates both jobs without calling S3 or ClamAV.

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

- [ ] **Step 2: Run tests and confirm missing adapters**

Run: `yarn tsx --test src/server/leads/clamav.test.ts src/server/leads/objectStore.test.ts src/server/leads/service.test.ts`

Expected: FAIL because the scanner, store, and service do not exist.

- [ ] **Step 3: Implement the ClamAV INSTREAM adapter**

Open a TCP connection to configured host/port, write `zINSTREAM\0`, then stream the complete file in chunks prefixed by four-byte big-endian lengths and finish with four zero bytes. Apply one end-to-end timeout. Map only `stream: OK` to clean, `FOUND` to `unsafe_file`, and connection/timeout/malformed/size errors to `scan_unavailable`; include the engine signature in private scan metadata but not public errors.

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

- [ ] **Step 4: Implement the private S3 adapter**

```ts
export interface PrivateAttachmentStore {
  putFile(input: { objectKey: string; path: string; contentType: string }): Promise<void>;
  materialize(input: { objectKey: string; tempRoot: string }): Promise<{ path: string; dispose(): Promise<void> }>;
  delete(objectKey: string): Promise<void>;
  listOlderThan(cutoff: Date): AsyncIterable<{ key: string; lastModified: Date }>;
}
```

Use a separate `S3Client` configured only from `LEAD_S3_*`. Put `createReadStream(path)` with `CacheControl: private, no-store`, configured SSE, and no public URL/ACL fallback. Materialization streams `GetObjectCommand.Body` into a mode-`0600` temp file and cleans partial files. Treat a confirmed `NoSuchKey` as already deleted only in retention; propagate it during delivery.

- [ ] **Step 5: Implement acceptance in the required order**

```ts
export type ServiceDecision =
  | { kind: "accepted"; response: AcceptedResponse }
  | { kind: "replayed"; response: AcceptedResponse }
  | { kind: "ignored" }
  | { kind: "rate_limited"; retryAfterSeconds: number };
```

Return `ignored` immediately after bounded parsing when the honeypot is non-empty. Normalize fields/context, HMAC the request IP, consume the IP attempt, load an existing submission to resolve its stored consent version, compute the fingerprint, and return replay/conflict before expensive work. For a new attachment: inspect, scan, create a random key under `LEAD_S3_PREFIX`, upload, then call `repository.accept`. Delete the just-uploaded object on transaction failure, conflict, rate limit, or racing replay. Always dispose local temp files in `finally`.

Convert a repository `conflict` to `LeadError("idempotency_conflict", 409)` after compensation; it is not a successful `ServiceDecision` variant.

- [ ] **Step 6: Pass focused service tests**

Run: `yarn tsx --test src/server/leads/clamav.test.ts src/server/leads/objectStore.test.ts src/server/leads/service.test.ts`

Expected: all adapter, ordering, and compensation tests pass.

- [ ] **Step 7: Commit the acceptance slice**

```bash
git add src/server/leads/clamav.ts src/server/leads/objectStore.ts src/server/leads/service.ts src/server/leads/clamav.test.ts src/server/leads/objectStore.test.ts src/server/leads/service.test.ts
git commit -m "feat(leads): accept scanned durable submissions"
```

---

### Task 6: Mount the secure public lead endpoint and non-mutating readiness

**Files:**

- Create: `src/server/leads/http.ts`
- Modify: `src/entry.server.tsx`
- Modify: `server/api-app.js`
- Modify: `server/runtime.mjs`
- Modify: `tests/ssr/support/runtime.ts`
- Create: `tests/ssr/leads.test.ts`
- Modify: `tests/deploy/readiness.test.mjs`

**Interfaces:**

- Consumes: `createLeadService`, `parseLeadMultipart`, and Task 1 config.
- Produces: `createLeadRouter(overrides?): express.Router` exported from `src/entry.server.tsx`.
- Produces: `checkApplicationReady(): Promise<void>` exported from `src/entry.server.tsx`.
- Preserves: `GET /api/health` and `GET /api/health/ready` response shapes.

- [ ] **Step 1: Write failing endpoint tests**

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

Add tests for `200` replay plus `Idempotency-Replayed: true`, `202` honeypot with no `leadId`, `409` conflicting key, `413`, `415`, `422`, `429` plus bounded `Retry-After`, safe `503`, invalid UUID, foreign `Origin`, cross-site `Sec-Fetch-Site`, and production HTTP returning `426`. Assert no response includes SQL, paths, credentials, full vendor errors, or a raw contact.

- [ ] **Step 2: Run the endpoint test and confirm 404/missing export**

Run: `yarn build && TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test tests/ssr/leads.test.ts tests/deploy/readiness.test.mjs`

Expected: FAIL because `/api/leads` and composite readiness are absent.

- [ ] **Step 3: Implement the Express router and response map**

Require UUID `Idempotency-Key`; in production require `req.secure`, canonical `Origin: https://kordev.team`, and `Sec-Fetch-Site` absent or `same-origin`. Set `Cache-Control: no-store`, `Vary: Origin`, and `X-Content-Type-Options: nosniff`. Mount the lead router before `express.json()` and `express.urlencoded()` so those parsers never consume multipart bytes.

Map service decisions exactly:

```ts
accepted  -> 201 { leadId, status: "accepted" }
replayed  -> 200 + Idempotency-Replayed: true + stored response
ignored   -> 202 { status: "received" }
```

Map only `LeadError.code` values to the public error schema `{ error: { code, message, field_errors? }, request_id }`; choose Russian messages from a fixed table and log only request ID, opaque lead/job ID, status/code, and duration.

- [ ] **Step 4: Bridge the built router into the existing runtime**

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

In `server/api-app.js`, mount `leadRouter` at `/api/leads` before generic body parsers. Readiness calls PostgreSQL and structural web configuration checks only; it must not insert a lead, upload an object, scan a file, or call CRM/SMTP.

- [ ] **Step 5: Pass HTTP, readiness, build, and type checks**

Run: `yarn typecheck && yarn build && TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test tests/ssr/leads.test.ts && node --test tests/deploy/readiness.test.mjs`

Expected: all commands pass; endpoint tests observe the exact statuses/headers and readiness remains non-mutating.

- [ ] **Step 6: Commit the HTTP slice**

```bash
git add src/server/leads/http.ts src/entry.server.tsx server/api-app.js server/runtime.mjs tests/ssr/support/runtime.ts tests/ssr/leads.test.ts tests/deploy/readiness.test.mjs
git commit -m "feat(leads): expose secure multipart endpoint"
```

---

### Task 7: Implement the exact CRM adapter and SMTP delivery adapter

**Files:**

- Create: `src/server/leads/crm.ts`
- Create: `src/server/leads/email.ts`
- Create: `src/server/leads/retry.ts`
- Test: `src/server/leads/crm.test.ts`
- Test: `src/server/leads/email.test.ts`
- Test: `src/server/leads/retry.test.ts`

**Interfaces:**

- Consumes: claimed immutable lead/job data and `PrivateAttachmentStore.materialize()`.
- Produces: `sendToCrm(envelope, config, fetchImpl): Promise<CrmReceipt>`.
- Produces: `sendLeadEmail(envelope, config, transport): Promise<EmailReceipt>`.
- Produces: `classifyDeliveryFailure(channel, error): DeliveryDecision` and `nextRetryAt(input): Date`.

`DeliveryEnvelope` contains the immutable claimed job, normalized lead, and an optional materialized attachment `{ path, originalName, mediaType, sha256 }`. `CrmReceipt` contains only `requestId`, `taskId`, `taskCode`, `taskStatus`, `dueDate`, `replayed`, `rateLimit`, and `rateRemaining`. `EmailReceipt` contains only the provider message ID. `DeliveryDecision` is one of `{ kind: "retry"; retryAfterSeconds?: number }`, `{ kind: "terminal"; code: string }`, or `{ kind: "manual_action"; code: string }`.

- [ ] **Step 1: Write failing CRM contract tests against a local mock server**

Assert `POST /api/v1/board-intake/{publicId}/requests`, `Authorization: Bearer`, stable lead UUID in `Idempotency-Key`, stable job UUID in `X-Request-Id`, exact multipart names `name`/`phone`/optional `description`/one optional `file`, and no consent/context/internal fields. Assert only `201` with the documented response shape succeeds and stores only `request_id`, task `id`, `code`, `status`, `due_date`, plus rate-limit numbers.

Exercise network failure, 15-second abort, `429` with valid/invalid `Retry-After`, `500`, all documented `400`/`401`/`403`/`409` variants, `413`, `415`, malformed JSON, malformed success schema, and `Idempotency-Replayed: true`.

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

- [ ] **Step 2: Write failing SMTP and retry tests**

Use an injected Nodemailer transport and assert recipient `team@korotkov.dev`, sender from config, subject `Новая заявка KorDevTeam · <8-char lead suffix>`, deterministic `<lead-<uuid>@kordev.team>` Message-ID, Russian plain-text body, sanitized filename, and no raw IP/HMAC/vendor token. Assert SMTP 4xx/network errors retry and authentication/configuration/5xx recipient errors become manual action.

```ts
test("email uses a deterministic identity and one private attachment", async () => {
  await sendLeadEmail(envelope, smtpConfig, recordingTransport);
  assert.equal(recordedMail.to, "team@korotkov.dev");
  assert.equal(recordedMail.messageId, `<lead-${envelope.leadId}@kordev.team>`);
  assert.equal(recordedMail.attachments.length, 1);
  assert.equal(recordedMail.attachments[0].path, envelope.attachment?.path);
});
```

- [ ] **Step 3: Run tests and confirm missing adapters**

Run: `yarn tsx --test src/server/leads/crm.test.ts src/server/leads/email.test.ts src/server/leads/retry.test.ts`

Expected: FAIL because the three modules are absent.

- [ ] **Step 4: Implement streaming CRM multipart delivery**

Materialize a private object to a mode-`0600` worker temp file, open it with Node 22 `openAsBlob(path, { type })`, append it once to native `FormData`, and remove the temp file in `finally`. Send with `AbortSignal.timeout(15_000)` and never set multipart `Content-Type` manually. Validate success with a strict Zod schema and consume `X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Idempotency-Replayed` without logging raw response bodies.

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

Classify `idempotency_in_progress` as retry; `configuration_invalid` and `idempotency_conflict` as manual action; network/timeout/429/5xx as retry; and the remaining documented 400/401/403/413/415 errors as terminal/manual action without changing the body or key.

- [ ] **Step 5: Implement SMTP delivery and retry scheduling**

Create one Nodemailer transporter from `SMTP_*`. Send plain text plus one attachment path when present. The email channel uses exponential delay beginning at one minute, capped at six hours with deterministic jitter in tests, and becomes `manual_action` after 12 failed sends. CRM delays honor a valid `Retry-After` from 1–3600 seconds or use exponential delay beginning at one second; prevent any next CRM attempt at or after `acceptedAt + 23h55m`.

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

- [ ] **Step 6: Pass adapter contract tests**

Run: `yarn tsx --test src/server/leads/crm.test.ts src/server/leads/email.test.ts src/server/leads/retry.test.ts`

Expected: all response classifications, stable headers, multipart fields, email content, and cutoff boundaries pass.

- [ ] **Step 7: Commit the delivery-adapter slice**

```bash
git add src/server/leads/crm.ts src/server/leads/email.ts src/server/leads/retry.ts src/server/leads/crm.test.ts src/server/leads/email.test.ts src/server/leads/retry.test.ts
git commit -m "feat(leads): deliver to CRM and email"
```

---

### Task 8: Run one crash-safe outbox worker from the production image

**Files:**

- Create: `src/server/leads/worker.ts`
- Create: `src/server/leads/worker.test.ts`
- Create: `server/lead-worker.mjs`
- Modify: `src/entry.server.tsx`
- Modify: `package.json`

**Interfaces:**

- Consumes: repository claim/update methods, CRM/email adapters, retry policy, and private object materialization.
- Produces: `runLeadWorker(options): Promise<void>`, `runWorkerBatch(options): Promise<number>`, and `checkLeadWorkerReady(): Promise<void>`.
- Produces: `node server/lead-worker.mjs` and `node server/lead-worker.mjs --check`.

- [ ] **Step 1: Write failing worker tests**

```ts
test("one channel failure does not suppress the other channel", async () => {
  const processed = await runWorkerBatch(fixtureWithCrmRetryAndEmailSuccess);
  assert.equal(processed, 2);
  assert.equal(repository.state("crm"), "retry");
  assert.equal(repository.state("email"), "delivered");
});
```

Add tests for two workers never delivering the same live lease, expired lease recovery, delivery metadata sanitization, CRM token exhaustion rescheduling without a vendor call, 24-hour CRM cutoff to `manual_action`, SMTP attempt cutoff, S3 materialization cleanup, graceful abort, and `--check` performing no delivery.

- [ ] **Step 2: Run tests and confirm the worker is missing**

Run: `yarn tsx --test src/server/leads/worker.test.ts`

Expected: FAIL because worker functions are absent.

- [ ] **Step 3: Implement one bounded worker loop**

```ts
export async function runWorkerBatch({ repository, crm, email, store, ownerId, batchSize = 10, clock }: WorkerOptions) {
  const jobs = await repository.claimDueJobs(ownerId, batchSize, 120_000);
  for (const job of jobs) {
    await processClaimedJob(job, { repository, crm, email, store, clock });
  }
  return jobs.length;
}
```

`WorkerOptions` contains `LeadRepository`, CRM/email sender functions, `PrivateAttachmentStore`, UUID `ownerId`, `batchSize`, injected clock/random source, and optional `AbortSignal`. The long-running wrapper adds only polling and signal handling around `runWorkerBatch`.

Before each CRM send, reserve the shared token bucket. If exhausted, reschedule to the bucket end without incrementing a vendor failure. Materialize an attachment for only the current job and dispose it in `finally`. Persist only bounded receipt fields or sanitized codes. Poll every second when idle, accept `AbortSignal`, stop claiming on SIGTERM/SIGINT, and let current bounded sends finish before exit.

- [ ] **Step 4: Export and create production entrypoint**

Export the worker factory/readiness from `src/entry.server.tsx`. `server/lead-worker.mjs` imports `../build/server/index.js`, supports only no argument or `--check`, generates one process UUID, and exits nonzero with a sanitized line on configuration/database failure. Add scripts:

```json
{
  "lead:worker": "node server/lead-worker.mjs",
  "lead:worker:check": "node server/lead-worker.mjs --check"
}
```

- [ ] **Step 5: Pass unit, build, and entrypoint checks**

Run: `yarn typecheck && yarn build && yarn tsx --test src/server/leads/worker.test.ts && NODE_ENV=test DATABASE_URL="$TEST_DATABASE_URL" yarn lead:worker:check`

Expected: tests/build pass and the check command exits `0` without creating or delivering a lead.

- [ ] **Step 6: Commit the worker slice**

```bash
git add src/server/leads/worker.ts src/server/leads/worker.test.ts server/lead-worker.mjs src/entry.server.tsx package.json
git commit -m "feat(leads): process outbox with leased worker"
```

---

### Task 9: Delete expired site copies and stale orphan objects safely

**Files:**

- Create: `src/server/leads/retention.ts`
- Create: `src/server/leads/retention.test.ts`
- Create: `server/lead-retention.mjs`
- Modify: `src/entry.server.tsx`
- Modify: `package.json`
- Create: `deploy/systemd/kordevteam-lead-retention.service`
- Create: `deploy/systemd/kordevteam-lead-retention.timer`

**Interfaces:**

- Consumes: repository expiration/object-reference methods and private store delete/list.
- Produces: `runLeadRetention({ limit: 100 }): Promise<RetentionReport>`.
- Produces: `node server/lead-retention.mjs` as a finite command.

- [ ] **Step 1: Write failing retention ordering tests**

Assert attachment object deletion completes before row deletion, S3 failure retains the lead for a later run, `NoSuchKey` allows row deletion, a no-file lead deletes directly, only rows with `expiresAt <= now` are selected, each run stops at 100 rows, and orphan keys younger than two hours or referenced in PostgreSQL remain untouched.

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

- [ ] **Step 2: Run the test and confirm retention is missing**

Run: `yarn tsx --test src/server/leads/retention.test.ts`

Expected: FAIL because `runLeadRetention` is absent.

- [ ] **Step 3: Implement bounded retention and orphan cleanup**

```ts
for (const lead of await repository.findExpiredLeads(limit)) {
  if (lead.objectKey) await store.deleteForRetention(lead.objectKey);
  await repository.deleteLeadAfterObject(lead.id);
}
```

After expired rows, page through only the configured private prefix and delete an object only when it is older than two hours and `attachmentKeyExists(key)` is false. Log counts and opaque IDs only. Continue other records after a per-record storage failure, return failed counts, and exit nonzero from the command when any deletion failed.

- [ ] **Step 4: Add the daily production timer**

The service runs as the dedicated unprivileged operations user and invokes:

```bash
docker compose -f /opt/kordevteam/current/deploy/docker-compose.team.yml run --rm --no-deps lead-worker node server/lead-retention.mjs
```

The unit sets `User=kordevteam`, `WorkingDirectory=/opt/kordevteam/current`, and `EnvironmentFile=/etc/kordevteam/operations.env`. The timer uses `OnCalendar=*-*-* 03:30:00 Europe/Moscow`, `Persistent=true`, and `RandomizedDelaySec=15m`. Add `lead:retention` to `package.json`.

- [ ] **Step 5: Pass retention and systemd syntax tests**

Run: `yarn tsx --test src/server/leads/retention.test.ts && systemd-analyze verify deploy/systemd/kordevteam-lead-retention.service deploy/systemd/kordevteam-lead-retention.timer`

Expected: retention tests pass; systemd units verify on Linux. On macOS, CI performs the `systemd-analyze` command and the local run records it as platform-skipped, not passed.

- [ ] **Step 6: Commit the retention slice**

```bash
git add src/server/leads/retention.ts src/server/leads/retention.test.ts server/lead-retention.mjs src/entry.server.tsx package.json deploy/systemd/kordevteam-lead-retention.service deploy/systemd/kordevteam-lead-retention.timer
git commit -m "feat(leads): expire private lead copies"
```

---

### Task 10: Build the reusable accessible form and correct the privacy draft

**Files:**

- Create: `src/components/LeadForm.tsx`
- Create: `src/components/LeadForm.test.tsx`
- Modify: `src/components/Contact.tsx`
- Modify: `src/locales/ru.json`
- Modify: `src/routes/legal.tsx`
- Modify: `tests/ssr/frameworkBoot.test.ts`

**Interfaces:**

- Consumes: `POST /api/leads` public contract.
- Produces: `LeadForm({ pagePath?, className? })` reusable on the home/contact section and future commercial pages.
- Preserves: existing contact methods, dark/light theme, ordinary motion, and reduced-motion behavior.

- [ ] **Step 1: Write failing browser-component tests**

Set up jsdom and Testing Library. Assert labeled required name/phone/consent, optional description/file, exact `accept` extensions, Russian inline errors/live region, keyboard submit, one in-flight request after double-click, and the button becoming usable after failure. Capture fetch requests and assert native multipart, one UUID header, same UUID for an unchanged retry, a new UUID after any field/file change, no manual `Content-Type`, and success only for `200`/`201` containing a valid `leadId`.

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

- [ ] **Step 2: Run tests and confirm the component is absent**

Run: `yarn tsx --test src/components/LeadForm.test.tsx`

Expected: FAIL because `LeadForm` does not exist.

- [ ] **Step 3: Implement form behavior and copy**

Use native semantic `<form>`, `<label>`, inputs, textarea, file input, and checkbox; reuse existing `Input`, `Textarea`, and `Button` where semantics remain native. Add `aria-invalid`, `aria-describedby`, focus the first invalid field, and announce request state in `role="status" aria-live="polite"`. Display «Ответим в течение рабочего дня» and «Пн–Пт, 09:00–18:00 по Москве».

Keep a snapshot hash plus UUID in a ref. Reuse the UUID only when the normalized fields and file name/size/lastModified are unchanged after a network/transient response; clear it on any edit after an attempt and after success. Never persist name, phone, description, file, or UUID in localStorage/sessionStorage.

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

- [ ] **Step 4: Embed the form without removing contact links**

Change `Contact` to a responsive two-column layout: contact cards remain in one column and `LeadForm` occupies the other. Keep the section `id="contact"`, existing motion, and mobile single-column order. Ensure SSR HTML contains the form, consent link `/privacy/`, business-hours copy, and no hidden email/company/service/budget inputs.

- [ ] **Step 5: Update the owner-review privacy draft**

Replace the obsolete “one contact/company/service/budget” wording with name, required phone, optional description and one optional file. Name Kusidis/Krasotula CRM, email delivery to `team@korotkov.dev`, private Timeweb object storage, ClamAV antivirus processing, and automatic 30-day site retention. Keep the existing comment that owner/legal review is required; do not claim legal approval.

- [ ] **Step 6: Pass component, SSR, and accessibility assertions**

Run: `yarn tsx --test src/components/LeadForm.test.tsx tests/ssr/frameworkBoot.test.ts && yarn typecheck && yarn build`

Expected: component interactions pass and SSR home HTML contains the complete Russian form before hydration.

- [ ] **Step 7: Commit the public form slice**

```bash
git add src/components/LeadForm.tsx src/components/LeadForm.test.tsx src/components/Contact.tsx src/locales/ru.json src/routes/legal.tsx tests/ssr/frameworkBoot.test.ts
git commit -m "feat(leads): add accessible request form"
```

---

### Task 11: Package one worker, ClamAV, private settings, and release checks

**Files:**

- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `deploy/docker-compose.team.yml`
- Modify: `scripts/deploy-common.sh`
- Modify: `scripts/deploy-slot.sh`
- Modify: `scripts/switch-slot.sh`
- Modify: `scripts/rollback-slot.sh`
- Modify: `tests/deploy/image.test.mjs`
- Create: `tests/deploy/leads.test.mjs`
- Modify: `tests/deploy/scripts.test.mjs`
- Modify: `tests/postgresCompose.test.ts`
- Create: `tests/fixtures/deploy-leads.env`
- Modify: `.github/workflows/docker-build.yml`
- Modify: `server/.env.example`
- Modify: `server/README.md`
- Modify: `deploy/README.md`

**Interfaces:**

- Consumes: the built router/worker/retention exports and all production variables defined in Task 1.
- Produces: exactly one `lead-worker` service and one internal `clamav` service.
- Produces: inactive-image worker configuration check before traffic switch and worker image alignment after successful switch/rollback.

- [ ] **Step 1: Write failing topology and release-script tests**

Parse both Compose files and assert: one worker only; no public worker/ClamAV/database port; worker and both web slots receive backend-only lead settings; private S3 variables are distinct from public media variables; web/worker have bounded `/tmp`; ClamAV is internal and healthy; worker overrides the image's HTTP healthcheck with `node server/lead-worker.mjs --check`; production refuses missing CRM/SMTP/S3/ClamAV/HMAC/consent variables; and logs rotate under the existing policy.

Extend script fixtures to assert inactive deployment runs `lead-worker.mjs --check` from the candidate image before declaring it ready, successful switch restarts the single worker with the new active immutable image, failed public smoke leaves the old worker untouched, and rollback restores the previous recorded image.

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

- [ ] **Step 2: Run deployment tests and confirm missing topology**

Run: `node --test tests/deploy/leads.test.mjs tests/deploy/image.test.mjs tests/deploy/scripts.test.mjs && yarn tsx --test tests/postgresCompose.test.ts`

Expected: FAIL because worker/ClamAV/configuration and script synchronization are absent.

- [ ] **Step 3: Add local and production services**

Use `CLAMAV_IMAGE` as an operator-supplied immutable digest in production and a documented local development tag in root Compose. Give ClamAV its own definitions volume and only the internal backend network. Mount a `tmpfs` large enough for one 25 MiB upload plus bounded multipart/worker copies; keep `no-new-privileges` and dropped capabilities.

Define `lead-worker` once with `WORKER_IMAGE`, the same `DATABASE_URL`/lead secrets/backend network as web, command `node server/lead-worker.mjs`, restart policy, one replica by topology, and its command healthcheck. Do not attach the proxy network or publish a port.

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

- [ ] **Step 4: Keep worker image synchronized atomically with releases**

During `deploy-slot.sh`, set `WORKER_IMAGE` to the recorded active image so Compose interpolation is complete, then run candidate `node server/lead-worker.mjs --check` after migrations and before inactive readiness succeeds. During `switch-slot.sh`, change traffic first, complete public smoke, then recreate `lead-worker` with the target's recorded immutable image and verify its health; if worker replacement fails, restore the prior route and prior worker image. Apply the inverse order safely in `rollback-slot.sh`. Record worker image state under the existing protected deployment directory.

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

- [ ] **Step 5: Add CI gates and operator documentation**

CI keeps fake/local adapters: it runs unit/contract tests without real credentials, builds the image, and uses in-process fake ClamAV/CRM/SMTP/S3 adapters for integration tests; it never sets a real CRM endpoint. Document exact variables, private-bucket policy, Timeweb endpoint, ClamAV sizing, SMTP setup, consent version changes, worker status, manual-action diagnosis, daily retention, and the explicit no-mutation readiness rule.

Create `tests/fixtures/deploy-leads.env` with test-only `.invalid` endpoints and immutable-looking fixture images so Compose rendering is reproducible:

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

Production variables to document are:

```text
LEAD_CONSENT_VERSION LEAD_HASH_KEY LEAD_TEMP_ROOT
LEAD_S3_ENDPOINT LEAD_S3_REGION LEAD_S3_BUCKET LEAD_S3_ACCESS_KEY_ID
LEAD_S3_SECRET_ACCESS_KEY LEAD_S3_PREFIX LEAD_S3_SSE
CLAMAV_HOST CLAMAV_PORT
CRM_INTAKE_ENDPOINT CRM_INTAKE_TOKEN
SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD SMTP_FROM
LEAD_EMAIL_TO WORKER_IMAGE CLAMAV_IMAGE
```

- [ ] **Step 6: Pass topology, script, image, and Compose tests**

Run:

```bash
node --test tests/deploy/leads.test.mjs tests/deploy/image.test.mjs tests/deploy/scripts.test.mjs
yarn tsx --test tests/postgresCompose.test.ts
docker compose config --quiet
docker compose --env-file tests/fixtures/deploy-leads.env -f deploy/docker-compose.team.yml config --quiet
bash -n scripts/deploy-common.sh scripts/deploy-slot.sh scripts/switch-slot.sh scripts/rollback-slot.sh
```

Expected: every command exits `0`; production Compose contains one private worker and no newly exposed ports.

- [ ] **Step 7: Commit the runtime and deployment slice**

```bash
git add Dockerfile docker-compose.yml deploy/docker-compose.team.yml scripts/deploy-common.sh scripts/deploy-slot.sh scripts/switch-slot.sh scripts/rollback-slot.sh tests/deploy/image.test.mjs tests/deploy/leads.test.mjs tests/deploy/scripts.test.mjs tests/postgresCompose.test.ts tests/fixtures/deploy-leads.env .github/workflows/docker-build.yml server/.env.example server/README.md deploy/README.md
git commit -m "feat(deploy): operate durable lead delivery"
```

---

### Task 12: Run the complete local release gate and record evidence

**Files:**

- Create: `tests/leads/endToEnd.test.ts`
- Modify only if the integration test reveals a defect in a file owned by Tasks 1–11.

**Interfaces:**

- Consumes: every prior task.
- Produces: fresh evidence that the whole site, migration, form, worker, and deployment topology work together without contacting production services.

- [ ] **Step 1: Start clean test infrastructure and apply migrations**

Run:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn db:migrate
DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn db:check
```

Expected: PostgreSQL is healthy, migrations complete, and Drizzle check exits `0`.

- [ ] **Step 2: Run static and automated verification**

Run:

```bash
yarn typecheck
TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn test
yarn build
```

Expected: typecheck, every existing/new test, and production build pass with zero failures. The only permitted skip is a test explicitly guarded by an unavailable platform tool; PostgreSQL integration tests must run, not skip.

- [ ] **Step 3: Add and run the fake-dependency end-to-end test**

In `tests/leads/endToEnd.test.ts`, start Express with the real lead router/service/repository against the test database and inject recording ClamAV, private store, CRM, and SMTP adapters. Submit one no-file lead and one clean-file lead, retry the first request with its original browser key, run worker batches until no job remains, and assert:

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

Verify in PostgreSQL and mock capture:

```text
2 leads
4 outbox jobs
2 CRM tasks, with the replay creating no third task
2 email messages
1 private attachment object
0 pending/retry jobs
0 contact values or secrets in runtime logs
```

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test tests/leads/endToEnd.test.ts`

Expected: one integration test passes with the exact counts above and no external network call.

- [ ] **Step 4: Exercise failure and recovery**

Add a second test in the same file. Make the recording CRM adapter return a retryable `500`, confirm public submission still returns `201`, create a new worker instance with an expired lease, restore CRM `201`, and confirm both recorded attempts used the same lead UUID and attachment checksum while the fake CRM contains one logical task. Make fake S3 deletion fail during retention, confirm the database row remains, restore deletion, advance the injected clock 30 days, and confirm object-before-row deletion.

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

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test tests/leads/endToEnd.test.ts`

Expected: both end-to-end tests pass.

- [ ] **Step 5: Run crawler and deployment regression gates**

Run:

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

Expected: crawler reports zero route/SEO violations, the temporary runtime is stopped, deployment tests pass, and `git diff --check` prints no errors.

- [ ] **Step 6: Commit the end-to-end verification test and any proven fixes**

```bash
git add tests/leads/endToEnd.test.ts
git add src/server/leads src/components/LeadForm.tsx server deploy scripts package.json yarn.lock
git diff --cached --check
git commit -m "test(leads): verify durable delivery recovery"
```

Before the second `git add`, inspect `git status --short` and include only files changed to correct failures demonstrated in Steps 2–5; do not stage unrelated owner work.

- [ ] **Step 7: Review scope and repository state**

Run: `git status --short && git log --oneline --decorate -12`

Expected: no uncommitted files remain, commits are the focused slices above, and there is no merge/push/deploy commit. Confirm no real CRM/SMTP/S3 request appears in logs or test configuration.
