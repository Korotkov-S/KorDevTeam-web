import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm, unlink, writeFile, mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { and, eq, inArray } from "drizzle-orm";
import express from "express";

import { createDb } from "../../src/server/db/client";
import { leadAttachments, leadDeliveryJobs, leads } from "../../src/server/db/schema";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import type { LeadWebConfig } from "../../src/server/leads/config";
import type { DeliveryEnvelope, CrmReceipt } from "../../src/server/leads/crm";
import type { EmailReceipt } from "../../src/server/leads/email";
import { createLeadRouter } from "../../src/server/leads/http";
import { MissingPrivateObjectError, type PrivateAttachmentStore } from "../../src/server/leads/objectStore";
import { createLeadRepository } from "../../src/server/leads/repository";
import { runLeadRetention, type RetentionLogRecord } from "../../src/server/leads/retention";
import { DeliveryFailure } from "../../src/server/leads/retry";
import { runWorkerBatch, type WorkerOptions } from "../../src/server/leads/worker";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const integrationTest = TEST_DATABASE_URL ? test : test.skip;
const CONTACT_NAMES_OR_SECRETS = /Анна|Борис|crm-test-token|smtp-test-password|private-access|private-secret/i;
const CONTACT_PHONE_DIGITS = ["79991112233", "79992223344"];

type MutableClock = { now(): Date; advance(milliseconds: number): void };
type FormInput = {
  name: string;
  phone: string;
  description: string;
  file?: { bytes: Buffer; name: string; type: string };
};
type Submission = { status: number; leadId: string };
type CrmAttempt = { idempotencyKey: string; attachmentSha256: string | null };
type EmailAttempt = EmailReceipt & { leadId: string };

const noFileForm: FormInput = {
  name: "Анна",
  phone: "+7 999 111-22-33",
  description: "Нужна интеграция сайта с CRM",
};

function clockAt(iso: string): MutableClock {
  let milliseconds = Date.parse(iso);
  return {
    now: () => new Date(milliseconds),
    advance(amount) { milliseconds += amount; },
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

class RecordingPrivateStore implements PrivateAttachmentStore {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string; lastModified: Date }>();
  readonly events: string[] = [];
  private failDelete = false;

  constructor(private readonly clock: MutableClock) {}

  async putFile(input: { objectKey: string; path: string; contentType: string }): Promise<void> {
    this.objects.set(input.objectKey, {
      bytes: await readFile(input.path),
      contentType: input.contentType,
      lastModified: this.clock.now(),
    });
  }

  async materialize(input: { objectKey: string; tempRoot: string }): Promise<{ path: string; dispose(): Promise<void> }> {
    const object = this.objects.get(input.objectKey);
    if (!object) throw new MissingPrivateObjectError();
    const path = join(input.tempRoot, `${randomUUID()}.attachment`);
    await writeFile(path, object.bytes, { mode: 0o600, flag: "wx" });
    return {
      path,
      async dispose() {
        try { await unlink(path); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      },
    };
  }

  async delete(objectKey: string): Promise<void> {
    if (!this.objects.delete(objectKey)) throw new MissingPrivateObjectError();
  }

  async deleteForRetention(objectKey: string): Promise<"deleted" | "missing"> {
    this.events.push(`object.delete:${objectKey}`);
    if (this.failDelete) {
      this.failDelete = false;
      throw new Error("private-secret storage failure");
    }
    return this.objects.delete(objectKey) ? "deleted" : "missing";
  }

  async *listOlderThan(cutoff: Date): AsyncIterable<{ key: string; lastModified: Date }> {
    for (const [key, object] of this.objects) {
      if (object.lastModified < cutoff) yield { key, lastModified: object.lastModified };
    }
  }

  failNextDelete(): void { this.failDelete = true; }
}

class RecordingCrm {
  readonly attempts: CrmAttempt[] = [];
  readonly tasks = new Map<string, { id: number }>();
  private status: 201 | 500 = 201;

  fail(): void { this.status = 500; }
  recover(): void { this.status = 201; }

  async send(envelope: DeliveryEnvelope): Promise<CrmReceipt> {
    this.attempts.push({ idempotencyKey: envelope.leadId, attachmentSha256: envelope.attachment?.sha256 ?? null });
    if (this.status === 500) throw new DeliveryFailure({ kind: "retry" });
    let task = this.tasks.get(envelope.leadId);
    const replayed = Boolean(task);
    if (!task) {
      task = { id: this.tasks.size + 1 };
      this.tasks.set(envelope.leadId, task);
    }
    return {
      requestId: null,
      taskId: task.id,
      taskCode: `TEST-${task.id}`,
      taskStatus: "new",
      dueDate: "2026-09-15 18:00:00",
      replayed,
      rateLimit: null,
      rateRemaining: null,
    };
  }
}

class RecordingEmail {
  readonly messages: EmailAttempt[] = [];

  async send(envelope: DeliveryEnvelope): Promise<EmailReceipt> {
    const receipt = { messageId: `<lead-${envelope.leadId}@example.test>` };
    this.messages.push({ ...receipt, leadId: envelope.leadId });
    return receipt;
  }
}

async function createFixture(t: TestContext) {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const clock = clockAt("2026-09-14T10:00:00.000Z");
  const repository = createLeadRepository(db, clock);
  const tempRoot = await mkdtemp(join(tmpdir(), "lead-e2e-"));
  const logs: unknown[] = [];
  const store = new RecordingPrivateStore(clock);
  const crm = new RecordingCrm();
  const email = new RecordingEmail();
  const config: LeadWebConfig = {
    consentVersion: "2026-09",
    hashKey: Buffer.alloc(32, 17).toString("base64"),
    tempRoot,
    clamav: { host: "recording-clamav.invalid", port: 3310, timeoutMs: 15_000 },
    s3: {
      endpoint: new URL("https://recording-s3.invalid"),
      region: "test",
      bucket: "private-test",
      accessKeyId: "private-access",
      secretAccessKey: "private-secret",
      prefix: "leads/private/",
      serverSideEncryption: "AES256",
    },
  };
  const scanner = {
    paths: [] as string[],
    async scan(path: string) {
      this.paths.push(path);
      return { scanMetadata: { engine: "ClamAV", result: "OK" }, scannedAt: clock.now() };
    },
  };
  const app = express();
  app.use("/api/leads", createLeadRouter({ config, repository, scanner, objectStore: store, log: record => logs.push(record) }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await closeServer(server);
    await rm(tempRoot, { recursive: true, force: true });
  });

  const worker = (ownerId = randomUUID()) => {
    const options: WorkerOptions = {
      repository,
      crm: envelope => crm.send(envelope),
      email: envelope => email.send(envelope),
      store,
      tempRoot,
      ownerId,
      crmTokenHash: "f".repeat(64),
      clock,
      random: () => 0,
    };
    return { runBatch: () => runWorkerBatch(options) };
  };

  const retentionRepository = {
    findExpiredLeads: repository.findExpiredLeads,
    attachmentKeyExists: repository.attachmentKeyExists,
    async deleteLeadAfterObject(leadId: string) {
      const [attachment] = await db.select({ objectKey: leadAttachments.objectKey })
        .from(leadAttachments).where(eq(leadAttachments.leadId, leadId));
      if (attachment) {
        assert.equal(store.objects.has(attachment.objectKey), false, "private object must be gone before its lead row");
      }
      store.events.push(`row.delete:${leadId}`);
      return repository.deleteLeadAfterObject(leadId);
    },
  };

  return {
    clock,
    clamav: scanner,
    crm,
    email,
    store,
    repository: {
      async hasLead(leadId: string) {
        return (await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId))).length === 1;
      },
    },
    worker: worker(),
    newWorker: () => worker(),
    retention: {
      run: () => runLeadRetention({ repository: retentionRepository, store, clock, logger: { write(record: RetentionLogRecord) { logs.push(record); } } }),
    },
    async submit(input: FormInput, browserKey = randomUUID()): Promise<Submission> {
      const form = new FormData();
      form.set("name", input.name);
      form.set("phone", input.phone);
      form.set("description", input.description);
      form.set("consent", "accepted");
      form.set("pagePath", "/contact");
      if (input.file) form.set("file", new Blob([input.file.bytes], { type: input.file.type }), input.file.name);
      const response = await fetch(`${origin}/api/leads`, {
        method: "POST",
        headers: { Origin: origin, "Idempotency-Key": browserKey },
        body: form,
      });
      const body = await response.json() as { leadId?: string; error?: unknown };
      assert.equal(typeof body.leadId, "string", `submission failed with ${response.status}: ${JSON.stringify(body.error)}`);
      return { status: response.status, leadId: body.leadId! };
    },
    async counts() {
      const leadRows = await db.select({ id: leads.id }).from(leads);
      const jobRows = await db.select({ status: leadDeliveryJobs.status }).from(leadDeliveryJobs);
      return {
        leads: leadRows.length,
        jobs: jobRows.length,
        crmTasks: crm.tasks.size,
        emails: email.messages.length,
        objects: store.objects.size,
        dueJobs: jobRows.filter(job => ["pending", "processing", "retry"].includes(job.status)).length,
      };
    },
    deliveryJobs: () => db.select({ leadId: leadDeliveryJobs.leadId, channel: leadDeliveryJobs.channel, status: leadDeliveryJobs.status })
      .from(leadDeliveryJobs),
    abandonDueJobs: (ownerId: string) => repository.claimDueJobs(ownerId, 10, 120_000),
    logsContainContactsOrSecrets() {
      const serialized = JSON.stringify(logs);
      const digits = serialized.replace(/\D/g, "");
      return CONTACT_NAMES_OR_SECRETS.test(serialized) || CONTACT_PHONE_DIGITS.some(phone => digits.includes(phone));
    },
    async attachmentChecksum(leadId: string) {
      const [attachment] = await db.select({ checksum: leadAttachments.checksum }).from(leadAttachments)
        .where(eq(leadAttachments.leadId, leadId));
      return attachment?.checksum ?? null;
    },
    async dueJobCount(leadId: string) {
      return (await db.select({ id: leadDeliveryJobs.id }).from(leadDeliveryJobs).where(and(
        eq(leadDeliveryJobs.leadId, leadId),
        inArray(leadDeliveryJobs.status, ["pending", "processing", "retry"]),
      ))).length;
    },
  };
}

integrationTest("two accepted leads deliver once to both channels", async t => {
  const fixture = await createFixture(t);
  const cleanBytes = await readFile("tests/fixtures/leads/clean.doc");
  const cleanFileForm: FormInput = {
    name: "Борис",
    phone: "+7 999 222-33-44",
    description: "Нужно мобильное приложение",
    file: { bytes: cleanBytes, name: "brief.doc", type: "application/msword" },
  };
  const firstBrowserKey = randomUUID();
  const secondBrowserKey = randomUUID();

  const first = await fixture.submit(noFileForm, firstBrowserKey);
  const replay = await fixture.submit(noFileForm, firstBrowserKey);
  const second = await fixture.submit(cleanFileForm, secondBrowserKey);
  assert.deepEqual([first.status, replay.status, second.status], [201, 200, 201]);
  assert.equal(replay.leadId, first.leadId);
  while (await fixture.worker.runBatch()) continue;

  assert.deepEqual(await fixture.counts(), {
    leads: 2,
    jobs: 4,
    crmTasks: 2,
    emails: 2,
    objects: 1,
    dueJobs: 0,
  });
  assert.equal(fixture.crm.attempts.length, 2);
  assert.equal(fixture.clamav.paths.length, 1);
  const deliveryJobs = await fixture.deliveryJobs();
  assert.deepEqual(deliveryJobs.map(job => job.status).sort(), ["delivered", "delivered", "delivered", "delivered"]);
  assert.deepEqual(deliveryJobs.map(job => `${job.leadId}:${job.channel}`).sort(), [
    `${first.leadId}:crm`, `${first.leadId}:email`, `${second.leadId}:crm`, `${second.leadId}:email`,
  ].sort());
  assert.deepEqual(fixture.email.messages.map(message => message.leadId).sort(), [
    first.leadId, second.leadId,
  ].sort());
  assert.equal(fixture.logsContainContactsOrSecrets(), false);
});

integrationTest("accepted work survives vendor failure, worker restart, and retention retry", async t => {
  const fixture = await createFixture(t);
  const cleanBytes = await readFile("tests/fixtures/leads/clean.doc");
  const cleanFileForm: FormInput = {
    name: "Борис",
    phone: "+7 999 222-33-44",
    description: "Нужно мобильное приложение",
    file: { bytes: cleanBytes, name: "brief.doc", type: "application/msword" },
  };
  const expectedChecksum = createHash("sha256").update(cleanBytes).digest("hex");
  fixture.crm.fail();

  const accepted = await fixture.submit(cleanFileForm);
  assert.equal(accepted.status, 201);
  assert.equal(fixture.clamav.paths.length, 1);
  assert.equal(await fixture.attachmentChecksum(accepted.leadId), expectedChecksum);
  await fixture.worker.runBatch();
  assert.equal(await fixture.dueJobCount(accepted.leadId), 1);

  fixture.clock.advance(1_000);
  const crashOwner = randomUUID();
  const abandoned = await fixture.abandonDueJobs(crashOwner);
  assert.equal(abandoned.length, 1);
  assert.equal(abandoned[0].channel, "crm");
  assert.equal(await fixture.newWorker().runBatch(), 0);
  assert.equal(fixture.crm.attempts.length, 1);

  fixture.clock.advance(120_001);
  fixture.crm.recover();
  await fixture.newWorker().runBatch();
  assert.equal(new Set(fixture.crm.attempts.map(attempt => attempt.idempotencyKey)).size, 1);
  assert.deepEqual(fixture.crm.attempts.map(attempt => attempt.attachmentSha256), [expectedChecksum, expectedChecksum]);
  assert.equal(fixture.crm.tasks.size, 1);
  assert.equal(await fixture.dueJobCount(accepted.leadId), 0);

  fixture.clock.advance(30 * 86_400_000);
  fixture.store.failNextDelete();
  assert.equal((await fixture.retention.run()).failures, 1);
  assert.equal(await fixture.repository.hasLead(accepted.leadId), true);
  assert.equal(fixture.store.objects.size, 1);
  assert.equal((await fixture.retention.run()).failures, 0);
  assert.equal(fixture.store.objects.size, 0);
  assert.equal(await fixture.repository.hasLead(accepted.leadId), false);
  assert.match(fixture.store.events.at(-2) ?? "", /^object\.delete:/);
  assert.match(fixture.store.events.at(-1) ?? "", /^row\.delete:/);
  assert.equal(fixture.logsContainContactsOrSecrets(), false);
});
