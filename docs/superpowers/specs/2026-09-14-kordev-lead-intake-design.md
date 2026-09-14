# KorDevTeam Durable Lead Intake — Design Specification

**Date:** 2026-09-14

**Status:** approved in chat; awaiting written-spec review

**Source contract:** user-supplied `Kusidis Website Intake API` OpenAPI 3.1.0, version `1.0.0`, received 2026-09-14

**Parent specification:** `docs/superpowers/specs/2026-09-11-kordev-seo-conversion-design.md`

## 1. Outcome and scope

Build a reusable Russian-language lead form and durable delivery subsystem for `kordev.team`. A valid submission is accepted only after its lead, consent evidence, optional clean private attachment, and delivery jobs are durably recorded. Delivery to `team@korotkov.dev` and Kusidis/Krasotula CRM happens asynchronously and survives vendor outages or application restarts.

This is an independent conversion subproject. It includes the public form, PostgreSQL records, one private attachment, antivirus validation, Timeweb S3 storage, an outbox worker, SMTP delivery, the supplied CRM API adapter, anti-spam controls, retention, and automated tests.

It does not redesign the commercial pages, build the administrator lead inbox, replace the content editor, implement analytics consent, or switch production traffic. Commercial pages will embed the reusable form in the next subproject. Until then, the form is available on the existing contact section and through its resource endpoint.

This specification supersedes the parent specification only for the lead-form contract: the latest approved decision removes email/company/service/budget fields, makes phone mandatory, adds legacy `.doc`/`.xls` support, and raises the single-file limit from 10 MiB to the CRM contract's 25 MiB. All unrelated parent decisions remain unchanged.

## 2. Confirmed public form contract

Visible fields follow the supplied CRM documentation:

- `name`: required, trimmed, 1–255 Unicode characters;
- `phone`: required, maximum 50 characters and 5–20 digits after removing formatting characters;
- `description`: optional, maximum 10,000 characters;
- `file`: one optional file, maximum 25 MiB (`26,214,400` bytes);
- `consent`: required site-only checkbox linking to `/privacy/`; it is not sent to CRM.

Allowed file extensions and matching media types are:

- `.pdf` — `application/pdf`;
- `.doc` — `application/msword`;
- `.docx` — `application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
- `.xls` — `application/vnd.ms-excel`;
- `.xlsx` — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
- `.jpg` and `.jpeg` — `image/jpeg`;
- `.png` — `image/png`.

The form contains no email, company, service, or budget field. Page URL, referrer, and allowed UTM values are server-normalized context, not visible CRM fields. A visually hidden honeypot is accepted only by the site endpoint and is never forwarded.

The first release uses the honeypot and server-side rate limits without CAPTCHA.

The UI promises: «Ответим в течение рабочего дня». Business hours are Monday–Friday, 09:00–18:00 Moscow time. Submission, validation, queued delivery, and terminal delivery errors use Russian copy and an accessible live region. The submit button remains disabled only while the current request is in flight.

## 3. Request and idempotency contract

The browser submits `multipart/form-data` to `POST /api/leads` and must not set the `Content-Type` header manually. It sends a UUID in `Idempotency-Key`; one UUID represents one user submission and is reused for browser retries of the identical body.

The endpoint requires HTTPS in production. It rejects missing or malformed content type, missing or invalid UUID, oversized bodies, unsupported fields, or invalid values before creating delivery work. A strict request-size ceiling accounts for the 25 MiB file plus bounded multipart overhead.

The server computes a canonical request fingerprint from normalized text fields, the accepted consent state, attachment checksum, and normalized context. A new key records the then-current server-side consent-document version; an existing key uses its stored version when checking a replay, so a policy deployment cannot turn an otherwise identical retry into a conflict:

- first valid use of a key creates the lead and returns `201`;
- an identical replay returns `200` with the stored success response and `Idempotency-Replayed: true`;
- the same key with different content returns `409 idempotency_conflict`;
- concurrent identical requests serialize on the unique key and create one lead.

Successful public responses expose an opaque lead UUID and `status: "accepted"`; they do not expose CRM task identifiers or internal job state. Success means durable local acceptance, not immediate vendor delivery. A honeypot hit is the sole exception: it returns `202` with a generic `status: "received"`, no lead UUID, and creates no record or delivery job. The normal UI never populates the honeypot and treats only `200`/`201` responses containing a lead UUID as a real submission success.

## 4. Runtime architecture and data flow

```text
LeadForm
  -> POST /api/leads (multipart + Idempotency-Key)
     -> HTTPS / size / honeypot / rate-limit checks
     -> streaming multipart parser to private temporary file
     -> field, extension, MIME and magic-byte validation
     -> ClamAV scan
     -> private Timeweb S3 upload
     -> one PostgreSQL transaction
        -> lead
        -> consent evidence
        -> attachment metadata, when present
        -> CRM outbox job
        -> email outbox job
     -> 201 accepted

lead-worker
  -> claims due outbox rows with FOR UPDATE SKIP LOCKED
  -> CRM adapter and SMTP adapter
  -> records success, retry schedule, or terminal/manual-action state

daily retention job
  -> removes expired private object first
  -> deletes site-owned lead records after 30 days
```

Route and component code only translate HTTP/UI inputs. Validation, persistence, object storage, CRM payload creation, SMTP payload creation, retry policy, and retention live in focused server modules.

## 5. PostgreSQL model

### `leads`

- UUID primary key, also used as the CRM `Idempotency-Key`;
- unique browser submission UUID;
- request fingerprint;
- normalized `name`, `phone`, optional `description`;
- normalized page path, optional referrer origin/path, and allowed UTM JSON;
- HMAC hashes of normalized phone and client IP for rate limiting without logging raw values;
- consent version and consent timestamp;
- accepted timestamp and `expires_at` exactly 30 days later;
- immutable stored success response JSON.

Raw client IP is not persisted. The phone is retained only because both CRM/email delivery require the submitted value and is deleted with the lead after 30 days.

### `lead_attachments`

- UUID primary key and unique lead foreign key with cascade;
- unpredictable private S3 object key;
- original sanitized filename, verified media type, byte size, SHA-256 checksum;
- antivirus engine/result metadata and scan timestamp;
- created and expiration timestamps.

There is at most one attachment per lead. No public URL is stored or returned.

### `lead_delivery_jobs`

- UUID primary key and lead foreign key with cascade;
- channel constrained to `crm` or `email`, unique per lead/channel;
- status constrained to `pending`, `processing`, `retry`, `delivered`, `terminal`, or `manual_action`;
- attempt count, next-attempt time, lease owner/expiry;
- sanitized last error code and vendor request ID;
- delivered timestamp and bounded response metadata JSON.

The outbox transaction creates exactly one CRM and one email job. Job payloads are derived from the lead at execution time and do not duplicate the attachment or secrets in JSON.

### `lead_rate_limits`

Rate-limit buckets store only HMAC subject hashes, window start, count, and expiration. The initial limits are five non-honeypot submission attempts per 30 minutes per IP hash and three accepted attempts per hour per phone hash. Honeypot hits do not consume rate-limit quota or vendor calls and receive the `202` response defined above.

## 6. Attachment safety and storage

Multipart parsing streams to a mode-`0600` file in an explicit private temporary directory. The implementation does not buffer a 25 MiB upload in React state, JSON, logs, or an outbox row.

Validation is fail-closed:

- compare normalized extension with the declared MIME allowlist;
- verify PDF, JPEG, PNG, and Compound File Binary signatures, including the expected Word/Workbook streams for legacy DOC/XLS;
- inspect OOXML ZIP contents so DOCX contains Word parts and XLSX contains Excel parts;
- reject encrypted, malformed, polyglot, truncated, multiple, or empty files;
- reject a request as soon as parser/file limits are exceeded;
- sanitize the display filename and generate an unrelated random object key.

ClamAV scans the complete temporary file before it becomes deliverable or is uploaded. A detection returns `422 unsafe_file`; unavailable or timed-out antivirus returns `503 scan_unavailable`. Neither state creates a lead.

A clean attachment uploads to a private Timeweb S3 prefix with private ACL and encryption settings supported by the provider. If the subsequent PostgreSQL transaction fails, the server attempts compensating object deletion and records only a sanitized orphan-cleanup error. A scheduled orphan check may delete objects not referenced by PostgreSQL after a safety window.

Temporary files are removed in a `finally` path after success or failure. Attachment bytes and private object URLs never appear in application logs, analytics, HTML, or public media endpoints.

## 7. Kusidis/Krasotula CRM adapter

Runtime secrets are supplied only to the backend:

- `CRM_INTAKE_ENDPOINT`: the complete HTTPS URL ending in `/api/v1/board-intake/{publicId}/requests`;
- `CRM_INTAKE_TOKEN`: the board-scoped Bearer token with `board_intake.create` only.

The adapter sends exactly one multipart `file` plus `name`, `phone`, and optional `description`. It sends the lead UUID as `Idempotency-Key` on every attempt and a stable UUID `X-Request-Id` for tracing. It never forwards consent, IP/referrer/UTM context, hashes, internal IDs other than idempotency, or email-only presentation text.

The adapter accepts `201`, validates the documented response shape, stores only `request_id`, task `id`, `code`, `status`, and `due_date`, and recognizes `Idempotency-Replayed: true`. It never logs the token or full response body.

The worker enforces the documented ceiling of 20 modifying requests per minute for the board token across concurrent workers. It also observes valid `X-RateLimit-Limit` and `X-RateLimit-Remaining` response headers so queued work cannot bypass the shared token budget.

Retry classification follows the supplied contract:

- retry unchanged after network errors, 15-second timeout, `429`, `5xx`, and `409 idempotency_in_progress`;
- honor a valid bounded `Retry-After` for `429`;
- use exponential delay with jitter for network/`5xx` failures;
- mark `400`, `401`, `403`, `413`, `415`, `409 configuration_invalid`, and `409 idempotency_conflict` terminal/manual-action without automatic body changes;
- reuse the same lead UUID and exact payload for every retry;
- stop automatic CRM retries before the vendor's 24-hour idempotency retention expires and mark the job `manual_action`; never generate a replacement key automatically.

Endpoint and token absence is a configuration error visible in readiness/worker status. Contract tests use a local mock server; no real CRM request is made by repository tests.

## 8. Email adapter

The email job sends to `team@korotkov.dev` through configured SMTP. The message contains the submitted name, phone, optional description, accepted time, page context, and sanitized attachment when present. The worker reads attachment bytes from the private object by stored key only while constructing the message; it does not make the object public. It uses a deterministic Message-ID derived from the lead UUID and never places contact data in the subject beyond the lead UUID suffix.

SMTP settings use backend-only `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `LEAD_EMAIL_TO`; production requires `LEAD_EMAIL_TO=team@korotkov.dev`. Network and transient SMTP failures retry with bounded exponential backoff. Permanent recipient/authentication/configuration failures become `manual_action`. SMTP delivery is at-least-once; a provider may duplicate a message after an ambiguous network failure, so the deterministic Message-ID and visible lead UUID support deduplication.

CRM and email jobs are independent. One delivered channel does not suppress retries for the other, and neither delivery failure changes a previously returned accepted response into a false public failure.

## 9. Worker, readiness, and retention

The production image provides a separate `lead-worker` command using the same PostgreSQL and private S3 configuration as both web slots. Private attachment storage uses backend-only `LEAD_S3_ENDPOINT`, `LEAD_S3_REGION`, `LEAD_S3_BUCKET`, `LEAD_S3_ACCESS_KEY_ID`, `LEAD_S3_SECRET_ACCESS_KEY`, and `LEAD_S3_PREFIX`; its bucket/prefix must not share the public media policy. Any number of workers may claim jobs using leases and `FOR UPDATE SKIP LOCKED`; crashed leases become eligible after their bounded expiry.

Web readiness checks PostgreSQL connectivity and validates lead configuration structurally without inserting a lead or calling a vendor. Worker readiness additionally validates the presence and syntax of CRM, SMTP, S3, `CLAMAV_HOST`, `CLAMAV_PORT`, and `LEAD_HASH_KEY` configuration without exposing values or making test deliveries. Production deployment smoke does not send a real lead; it checks only this non-mutating readiness surface.

A daily retention command selects expired leads in bounded batches. For attachment leads it deletes the private S3 object before deleting the PostgreSQL row. S3 failure retains the row for retry. A lead without an attachment may be hard-deleted immediately after expiration. Logs record opaque lead/job IDs, release SHA, channel, attempt, duration, HTTP/SMTP class, and sanitized error code only.

## 10. Security and privacy

- Production accepts submissions only over the trusted HTTPS proxy path and emits HSTS.
- CRM/SMTP/S3/ClamAV secrets never enter client bundles, loader data, HTML, error bodies, artifacts, or ordinary logs.
- CSRF is not required for an unauthenticated creation-only endpoint, but strict same-origin CORS, content type, `Origin`/`Sec-Fetch-Site` checks, honeypot, rate limits, and no credentialed CORS reduce browser abuse.
- Server validation is authoritative; client validation exists for usability only.
- Error responses never echo attachment bytes, authorization headers, raw vendor bodies, full contacts, or database errors.
- The privacy page must describe the exact fields, Kusidis/Krasotula CRM, email recipient, Timeweb private storage, antivirus processing, and 30-day site retention before production release.
- The privacy text remains an owner/legal-review draft; implementation does not claim legal approval.

## 11. Public error semantics

- `201 accepted`: durable new lead;
- `200 accepted` plus `Idempotency-Replayed: true`: identical replay;
- `202 received`: honeypot request ignored without persistence or analytics success;
- `400 validation_error`: invalid field, consent, UUID, multipart structure, or context;
- `409 idempotency_conflict`: reused key with different content;
- `413 file_too_large`: parser or file limit exceeded;
- `415 unsupported_file_type`: extension/MIME/signature mismatch;
- `422 unsafe_file`: malware detection;
- `429 rate_limit_exceeded`: site-side throttling with bounded `Retry-After`;
- `503 storage_unavailable`, `scan_unavailable`, or `service_unavailable`: safe transient local failure;
- `500 internal_error`: sanitized unexpected failure with a request ID.

Vendor delivery state is not exposed to anonymous clients after acceptance. The future protected admin inbox will display sanitized channel state and provide explicit retry controls.

## 12. Verification gates

Automated coverage must prove:

- field normalization and exact limits, including Unicode names and formatted phones;
- multipart limits and single-file enforcement;
- extension, MIME, magic-byte, OOXML structure, malware, timeout, and ClamAV-unavailable behavior;
- no-file submissions;
- PostgreSQL transaction atomicity and unique idempotency under concurrency;
- identical replay and conflicting replay behavior;
- private S3 upload, compensation, and 30-day deletion ordering;
- two outbox jobs created in the same transaction;
- worker lease recovery and concurrent `SKIP LOCKED` claims;
- exact CRM multipart payload, stable UUID headers, response validation, retry/terminal matrix, `Retry-After`, and the 24-hour stop boundary;
- SMTP payload, deterministic Message-ID, attachment, and retry classification;
- honeypot and both HMAC rate limits without raw IP logging;
- HTTP rejection, same-origin CORS, HSTS, safe errors, and secret/contact log redaction;
- accessible client validation, keyboard submission, live announcements, double-click prevention, and responsive layout;
- existing SSR, sitemap, proxy, migration, backup, and release tests remain green.

No test or local rehearsal contacts the real CRM, SMTP server, or production S3 bucket.

## 13. Release boundary

Development uses fake/local adapters and a mock CRM server. The real `CRM_INTAKE_ENDPOINT`, `CRM_INTAKE_TOKEN`, SMTP credentials, Timeweb private bucket settings, ClamAV address, and HMAC key are added only to the private production environment before release.

This subproject may be pushed and built without those production values, but production switching is blocked until non-mutating readiness confirms complete configuration, the privacy draft is owner-reviewed, and the inactive-slot form smoke persists a deliberately marked test lead only when an operator explicitly enables that mutation.

The current approved `main` remains local until the owner asks to push. This design does not authorize a remote push or production change.
