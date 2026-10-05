import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";

import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { createGeoRepository } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

async function createFixture() {
  await resetTestDatabase(TEST_DATABASE_URL);
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const adminId = randomUUID();
  const tokenId = randomUUID();
  const topicId = randomUUID();
  const promptId = randomUUID();
  const runId = randomUUID();

  await pool.query(
    `INSERT INTO admin_users (id, login, password_digest, password_salt)
     VALUES ($1, $2, $3, $4)`,
    [adminId, `geo-${adminId}`, "digest", "salt"],
  );
  await pool.query(
    `INSERT INTO mcp_tokens (id, admin_user_id, name, token_hash, token_prefix, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tokenId, adminId, "GEO test", "a".repeat(64), "kordev_geo", ["seo:read", "seo:write"]],
  );
  await pool.query(
    `INSERT INTO geo_topics (id, name, slug, priority, status)
     VALUES ($1, 'CRM', 'crm', 100, 'active')`,
    [topicId],
  );
  await pool.query(
    `INSERT INTO geo_prompts
      (id, prompt_text, normalized_text, topic_id, tags, category, status, priority, language, region, target_path, source)
     VALUES ($1, 'Какая CRM подходит для B2B?', 'какая crm подходит для b2b', $2, ARRAY['crm'], 'commercial', 'active', 100, 'ru', 'RU', '/services/crm/', 'catalog')`,
    [promptId, topicId],
  );
  await pool.query(
    `INSERT INTO geo_runs
      (id, platform, surface, mode, region, language, status, prompt_ids, planned_count, initiated_by_mcp_token_id, prompt_set_fingerprint)
     VALUES ($1, 'chatgpt_search', 'search', 'live_ui', 'RU', 'ru', 'running', ARRAY[$2]::uuid[], 3, $3, $4)`,
    [runId, promptId, tokenId, "b".repeat(64)],
  );

  return { pool, adminId, tokenId, topicId, promptId, runId };
}

async function expectConstraint(
  promise: Promise<unknown>,
  code: "23505" | "23514",
) {
  await assert.rejects(promise, (error: unknown) => {
    return (
      typeof error === "object" && error !== null && "code" in error && error.code === code
    );
  });
}

databaseTest("GEO prompts and observations reject duplicate comparison keys", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.pool.end());

  await expectConstraint(fixture.pool.query(
    `INSERT INTO geo_prompts
      (prompt_text, normalized_text, topic_id, tags, category, status, priority, language, region, target_path, source)
     VALUES ('Дубликат', 'какая crm подходит для b2b', $1, ARRAY[]::text[], 'commercial', 'candidate', 0, 'ru', 'RU', '/services/crm/', 'manual')`,
    [fixture.topicId],
  ), "23505");

  await fixture.pool.query(
    `INSERT INTO geo_observations
      (run_id, prompt_id, repetition, mentioned, linked, cited, response_excerpt, response_snapshot, response_hash, source_count, session_personalized)
     VALUES ($1, $2, 1, false, false, false, '', 'Ответ', $3, 0, false)`,
    [fixture.runId, fixture.promptId, "c".repeat(64)],
  );
  await expectConstraint(fixture.pool.query(
    `INSERT INTO geo_observations
      (run_id, prompt_id, repetition, mentioned, linked, cited, response_excerpt, response_snapshot, response_hash, source_count, session_personalized)
     VALUES ($1, $2, 1, false, false, false, '', 'Другой ответ', $3, 0, false)`,
    [fixture.runId, fixture.promptId, "d".repeat(64)],
  ), "23505");
});

databaseTest("GEO evidence enforces safe URLs, bounded snapshots, and coherent flags", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.pool.end());

  await expectConstraint(fixture.pool.query(
    `INSERT INTO geo_observations
      (run_id, prompt_id, repetition, mentioned, linked, cited, source_order, response_excerpt, response_snapshot, response_hash, source_count, session_personalized)
     VALUES ($1, $2, 1, false, false, true, 1, '', 'Ответ', $3, 1, false)`,
    [fixture.runId, fixture.promptId, "c".repeat(64)],
  ), "23514");

  await expectConstraint(fixture.pool.query(
    `INSERT INTO geo_observations
      (run_id, prompt_id, repetition, mentioned, linked, cited, response_excerpt, response_snapshot, response_hash, source_count, session_personalized)
     VALUES ($1, $2, 1, false, false, false, '', $3, $4, 0, false)`,
    [fixture.runId, fixture.promptId, "я".repeat(9000), "d".repeat(64)],
  ), "23514");

  const observation = await fixture.pool.query<{ id: string }>(
    `INSERT INTO geo_observations
      (run_id, prompt_id, repetition, mentioned, linked, cited, response_excerpt, response_snapshot, response_hash, source_count, session_personalized)
     VALUES ($1, $2, 1, false, false, false, '', 'Ответ', $3, 0, false)
     RETURNING id`,
    [fixture.runId, fixture.promptId, "e".repeat(64)],
  );
  await expectConstraint(fixture.pool.query(
    `INSERT INTO geo_citations (observation_id, url, hostname, source_order, is_owned, category)
     VALUES ($1, 'javascript:alert(1)', 'example.test', 1, false, 'other')`,
    [observation.rows[0].id],
  ), "23514");
});

databaseTest("GEO counts and experiment windows are constrained", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.pool.end());

  await expectConstraint(fixture.pool.query(
    `INSERT INTO geo_referral_daily_metrics
      (observation_date, platform, users, new_users, visits, pageviews, landing_path)
     VALUES ('2026-09-27', 'chatgpt_search', -1, 0, 0, 0, '/')`,
  ), "23514");

  const recommendation = await fixture.pool.query<{ id: string }>(
    `INSERT INTO seo_recommendations
      (title, rationale, issue_type, evidence, confidence, fingerprint)
     VALUES ('GEO gap', 'Три полных запуска', 'geo_visibility_gap', '{}'::jsonb, 'high', $1)
     RETURNING id`,
    ["f".repeat(64)],
  );
  await expectConstraint(fixture.pool.query(
    `INSERT INTO geo_experiments
      (recommendation_id, page_path, action_type, hypothesis, platform, mode, language, region,
       prompt_set_fingerprint, primary_metric, direction, minimum_delta, evaluation_windows, expected_signal)
     VALUES ($1, '/services/crm/', 'content_answer', 'Добавить прямой ответ', 'chatgpt_search', 'live_ui', 'ru', 'RU',
       $2, 'citation_rate', 'increase', 0.1, ARRAY[7, 28], 'Рост цитирований')`,
    [recommendation.rows[0].id, "1".repeat(64)],
  ), "23514");
});

databaseTest("deleting a GEO run removes its complete observation graph", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.pool.end());
  const entityId = randomUUID();
  await fixture.pool.query(
    `INSERT INTO geo_entities (id, canonical_name, type, aliases, domains, status)
     VALUES ($1, 'KorDevTeam', 'owned', ARRAY['KorDevTeam'], ARRAY['kordev.team'], 'active')`,
    [entityId],
  );
  const observation = await fixture.pool.query<{ id: string }>(
    `INSERT INTO geo_observations
      (run_id, prompt_id, repetition, mentioned, linked, cited, source_order, response_excerpt, response_snapshot, response_hash, source_count, session_personalized)
     VALUES ($1, $2, 1, true, true, true, 1, 'KorDevTeam', 'Ответ', $3, 1, false)
     RETURNING id`,
    [fixture.runId, fixture.promptId, "2".repeat(64)],
  );
  await fixture.pool.query(
    `INSERT INTO geo_observation_mentions (observation_id, entity_id, first_mention_order, recommended, sentiment)
     VALUES ($1, $2, 1, true, 'positive')`,
    [observation.rows[0].id, entityId],
  );
  await fixture.pool.query(
    `INSERT INTO geo_citations (observation_id, url, hostname, source_order, is_owned, category, local_path)
     VALUES ($1, 'https://kordev.team/services/crm/', 'kordev.team', 1, true, 'owned', '/services/crm/')`,
    [observation.rows[0].id],
  );
  await fixture.pool.query(
    `INSERT INTO geo_fanout_queries (observation_id, position, query_text, source)
     VALUES ($1, 1, 'CRM для B2B', 'platform')`,
    [observation.rows[0].id],
  );

  await fixture.pool.query("DELETE FROM geo_runs WHERE id = $1", [fixture.runId]);
  for (const table of ["geo_observations", "geo_observation_mentions", "geo_citations", "geo_fanout_queries"]) {
    const result = await fixture.pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
    assert.equal(result.rows[0].count, "0", `${table} must cascade with its run`);
  }
});

databaseTest("GEO repository isolates run ownership, records evidence atomically, and is idempotent", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.pool.end());
  const repository = createGeoRepository(createDb(TEST_DATABASE_URL));
  const input = {
    promptId: fixture.promptId,
    repetition: 1 as const,
    mentioned: false,
    linked: true,
    cited: true,
    sourceOrder: 1,
    responseExcerpt: "Источник KorDevTeam",
    responseSnapshot: "Полный ответ",
    snapshotTruncated: false,
    responseHash: "9".repeat(64),
    modelName: "test",
    sourceCount: 1,
    sessionPersonalized: false,
    mentions: [],
    citations: [{
      url: "https://kordev.team/services/crm/",
      hostname: "kordev.team",
      title: "CRM",
      sourceOrder: 1,
      isOwned: true,
      category: "owned" as const,
      localPath: "/services/crm/",
    }],
    fanoutQueries: [{ queryText: "CRM для бизнеса", position: 1, source: "platform" }],
  };

  await assert.rejects(
    repository.recordObservation(fixture.runId, randomUUID(), input),
    /geo_run_forbidden/u,
  );
  const first = await repository.recordObservation(fixture.runId, fixture.tokenId, input);
  const duplicate = await repository.recordObservation(fixture.runId, fixture.tokenId, input);
  assert.equal(duplicate.id, first.id);

  const counts = await fixture.pool.query<{ observations: string; citations: string; fanout: string }>(
    `SELECT
       (SELECT count(*) FROM geo_observations)::text AS observations,
       (SELECT count(*) FROM geo_citations)::text AS citations,
       (SELECT count(*) FROM geo_fanout_queries)::text AS fanout`,
  );
  assert.deepEqual(counts.rows[0], { observations: "1", citations: "1", fanout: "1" });

  await assert.rejects(repository.finishRun(fixture.runId, randomUUID(), {
    status: "success", completedCount: 1, storedCount: 1, errorCode: null, metadata: {},
  }), /geo_run_forbidden/u);
  await assert.rejects(repository.finishRun(fixture.runId, fixture.tokenId, {
    status: "success", completedCount: 1, storedCount: 0, errorCode: null, metadata: {},
  }), /geo_run_counts_mismatch/u);
  await assert.rejects(repository.finishRun(fixture.runId, fixture.tokenId, {
    status: "success", completedCount: 1, storedCount: 1, errorCode: null, metadata: {},
  }), /geo_run_counts_mismatch/u);
  for (const repetition of [2, 3] as const) {
    await repository.recordObservation(fixture.runId, fixture.tokenId, {
      ...input, repetition, responseHash: String(repetition).repeat(64),
    });
  }
  const finished = await repository.finishRun(fixture.runId, fixture.tokenId, {
    status: "success", completedCount: 3, storedCount: 3, errorCode: null, metadata: {},
  });
  assert.equal(finished.status, "success");
});

databaseTest(
  "GEO runs bind an exact active prompt set and derive the complete three-repetition plan",
  async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.pool.end());
    await fixture.pool.query("DELETE FROM geo_runs");
    const repository = createGeoRepository(createDb(TEST_DATABASE_URL));
    const run = await repository.startRun(
      {
        platform: "chatgpt_search",
        surface: "search",
        mode: "api_probe",
        region: "RU",
        language: "ru",
        promptIds: [fixture.promptId],
        metadata: {},
      },
      fixture.tokenId,
    );
    assert.equal(run.plannedCount, 3);
    assert.deepEqual(run.promptIds, [fixture.promptId]);
    assert.equal(run.promptSetFingerprint,
    createHash("sha256").update(fixture.promptId, "utf8").digest("hex"));
    await assert.rejects(
      repository.startRun(
        {
          platform: "chatgpt_search",
          surface: "search",
          mode: "api_probe",
          region: "RU-MOW",
          language: "ru",
          promptIds: [fixture.promptId],
          metadata: {},
        },
        fixture.tokenId,
      ),
      /geo_run_prompt_set_invalid/u,
    );
    const otherPromptId = randomUUID();
    await fixture.pool.query(
    `INSERT INTO geo_prompts
      (id, prompt_text, normalized_text, topic_id, tags, category, status, priority, language, region, target_path, source)
     VALUES ($1, 'Другая CRM?', 'другая crm?', $2, ARRAY['crm'], 'commercial', 'active', 50, 'ru', 'RU', '/services/crm/', 'manual')`,
    [otherPromptId, fixture.topicId],
  );
    await assert.rejects(repository.recordObservation(run.id, fixture.tokenId, {
    promptId: otherPromptId, repetition: 1, mentioned: false, linked: false, cited: false, sourceOrder: null,
    responseExcerpt: "", responseSnapshot: "", snapshotTruncated: false, responseHash: "6".repeat(64),
    modelName: null, sourceCount: 0, sessionPersonalized: false, mentions: [], citations: [], fanoutQueries: [],
  }), /geo_run_prompt_set_invalid/u);
  },
);

databaseTest("failed GEO evidence graph rolls back the observation", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.pool.end());
  const repository = createGeoRepository(createDb(TEST_DATABASE_URL));
  const ownedEntityId = randomUUID();
  await fixture.pool.query(
    `INSERT INTO geo_entities (id, canonical_name, type, aliases, domains, status)
     VALUES ($1, 'KorDevTeam', 'owned', ARRAY['KorDevTeam'], ARRAY['kordev.team'], 'active')`,
    [ownedEntityId],
  );
  await assert.rejects(repository.recordObservation(fixture.runId, fixture.tokenId, {
    promptId: fixture.promptId,
    repetition: 1,
    mentioned: true,
    linked: false,
    cited: false,
    sourceOrder: null,
    responseExcerpt: "Ответ",
    responseSnapshot: "Ответ",
    snapshotTruncated: false,
    responseHash: "8".repeat(64),
    modelName: null,
    sourceCount: 0,
    sessionPersonalized: false,
    mentions: [],
    citations: [],
    fanoutQueries: [],
  }), /geo_observation_mention_flag_incoherent/u);
  await assert.rejects(repository.recordObservation(fixture.runId, fixture.tokenId, {
    promptId: fixture.promptId, repetition: 2, mentioned: false, linked: false, cited: false, sourceOrder: null,
    responseExcerpt: "Ответ", responseSnapshot: "Ответ", snapshotTruncated: false, responseHash: "7".repeat(64),
    modelName: null, sourceCount: 0, sessionPersonalized: false,
    mentions: [{ entityId: ownedEntityId, firstMentionOrder: 1, recommended: false, sentiment: "neutral" }],
    citations: [], fanoutQueries: [],
  }), /geo_observation_mention_flag_incoherent/u);
  const result = await fixture.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM geo_observations");
  assert.equal(result.rows[0].count, "0");
});

databaseTest("catalog sync inserts missing prompts, promotes catalog candidates, and preserves archived edits", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.pool.end());
  const repository = createGeoRepository(createDb(TEST_DATABASE_URL));
  await fixture.pool.query(
    `UPDATE geo_prompts SET status = 'archived', target_path = '/custom/' WHERE id = $1`,
    [fixture.promptId],
  );
  const entries = [
    {
      promptText: "Какая CRM подходит для B2B?",
      normalizedText: "какая crm подходит для b2b",
      topic: { slug: "crm", name: "CRM новое имя", targetPath: "/services/crm-development/" },
      tags: ["crm"], category: "commercial" as const, language: "ru", region: "RU",
      targetPath: "/services/crm-development/", linkedSeoQuery: null, priority: 90,
      status: "active" as const,
    },
    {
      promptText: "Кто внедряет CRM?",
      normalizedText: "кто внедряет crm?",
      topic: { slug: "crm", name: "CRM", targetPath: "/services/crm-development/" },
      tags: ["crm"], category: "commercial" as const, language: "ru", region: "RU",
      targetPath: "/services/crm-development/", linkedSeoQuery: null, priority: 80,
      status: "active" as const,
    },
  ];
  assert.deepEqual(await repository.syncPromptCatalog(entries), { inserted: 1, promoted: 0, preserved: 1 });
  const rows = await fixture.pool.query<{ normalized_text: string; status: string; target_path: string }>(
    "SELECT normalized_text, status, target_path FROM geo_prompts ORDER BY normalized_text",
  );
  assert.deepEqual(rows.rows, [
    { normalized_text: "какая crm подходит для b2b", status: "archived", target_path: "/custom/" },
    { normalized_text: "кто внедряет crm?", status: "active", target_path: "/services/crm-development/" },
  ]);
});

databaseTest(
  "a repeated competitor source creates only an unconfirmed candidate after two successful runs",
  async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.pool.end());
    await fixture.pool.query("DELETE FROM geo_runs");
    const repository = createGeoRepository(createDb(TEST_DATABASE_URL));

    for (let index = 0; index < 2; index++) {
      const run = await repository.startRun(
        {
          platform: "chatgpt_search",
          surface: "search",
          mode: "api_probe",
          region: "RU",
          language: "ru",
          promptIds: [fixture.promptId],
          metadata: {},
        },
        fixture.tokenId,
      );
      for (const repetition of [1, 2, 3] as const) await repository.recordObservation(run.id, fixture.tokenId, {
      promptId: fixture.promptId,
      repetition,
      mentioned: false,
      linked: false,
      cited: false,
      sourceOrder: null,
      responseExcerpt: "Конкурентный источник",
      responseSnapshot: "Конкурентный источник",
      snapshotTruncated: false,
      responseHash: String(index + repetition + 3).repeat(64),
      modelName: "test",
      sourceCount: 1,
      sessionPersonalized: false,
      mentions: [],
      citations: [{
        url: "https://competitor.example/crm/",
        hostname: "competitor.example",
        title: "CRM",
        sourceOrder: 1,
        isOwned: false,
        category: "competitor",
        localPath: null,
      }],
      fanoutQueries: [],
    });
      await repository.finishRun(run.id, fixture.tokenId, {
      status: "success", completedCount: 3, storedCount: 3, errorCode: null, metadata: {},
    });
      const candidates = await fixture.pool.query<{ canonical_name: string; status: string }>(
      "SELECT canonical_name, status FROM geo_entities WHERE canonical_name = 'competitor.example'",
    );
      assert.equal(candidates.rowCount, index, "candidate appears only after the second independent completed run");
      if (index === 1) assert.deepEqual(candidates.rows[0], { canonical_name: "competitor.example", status: "candidate" });
    }
  },
);

databaseTest(
  "GEO read model calculates only complete three-repetition runs and never lists private snapshots",
  async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.pool.end());
    const repository = createGeoRepository(createDb(TEST_DATABASE_URL));
    for (const repetition of [1, 2, 3]) {
      await fixture.pool.query(
      `INSERT INTO geo_observations
        (run_id, prompt_id, repetition, mentioned, linked, cited, source_order, response_excerpt,
         response_snapshot, response_hash, source_count, session_personalized)
       VALUES ($1, $2, $3, true, true, true, 1, 'Кратко', $4, $5, 1, false)`,
      [fixture.runId, fixture.promptId, repetition, `PRIVATE-${repetition}`, String(repetition).repeat(64)],
    );
      const observation = await fixture.pool.query<{ id: string }>(
      "SELECT id FROM geo_observations WHERE run_id = $1 AND prompt_id = $2 AND repetition = $3",
      [fixture.runId, fixture.promptId, repetition],
    );
      await fixture.pool.query(
        `INSERT INTO geo_citations (observation_id, url, hostname, source_order, is_owned, category, local_path)
       VALUES ($1, $2, 'kordev.team', 1, true, 'owned', '/services/crm/')`,
        [
          observation.rows[0].id,
          `https://kordev.team/services/crm/?r=${repetition}`,
        ],
      );
    }
    await fixture.pool.query(
    "UPDATE geo_runs SET status = 'success', started_at = date_trunc('day', now()) + interval '8 hours', completed_at = date_trunc('day', now()) + interval '9 hours', completed_count = 3, stored_count = 3 WHERE id = $1",
    [fixture.runId],
  );
    await fixture.pool.query(
    `INSERT INTO geo_runs
      (platform, surface, mode, region, language, status, started_at, completed_at, prompt_ids,
       planned_count, completed_count, stored_count, initiated_by_mcp_token_id, prompt_set_fingerprint, error_code)
     VALUES ('chatgpt_search', 'api', 'api_probe', 'US', 'en', 'failed', date_trunc('day', now()) + interval '20 hours',
       date_trunc('day', now()) + interval '20 hours 1 minute', ARRAY[$1]::uuid[], 3, 0, 0, $2, $3, 'geo_probe_failed')`,
    [fixture.promptId, fixture.tokenId, "f".repeat(64)],
  );
    await fixture.pool.query(
    `INSERT INTO geo_runs
      (platform, surface, mode, region, language, status, started_at, completed_at, prompt_ids,
       planned_count, completed_count, stored_count, initiated_by_mcp_token_id, prompt_set_fingerprint, error_code)
     VALUES ('chatgpt_search', 'search', 'live_ui', 'RU', 'ru', 'failed', date_trunc('day', now()) + interval '21 hours',
       date_trunc('day', now()) + interval '21 hours 1 minute', ARRAY[$1]::uuid[], 3, 0, 0, $2, $3, 'geo_ui_failed')`,
    [fixture.promptId, fixture.tokenId, "a".repeat(64)],
  );
    await fixture.pool.query(
    `INSERT INTO geo_crawler_checks (check_date, target, bot, status, checked_at, metadata)
     VALUES (CURRENT_DATE, '/services/crm/', 'indexability', 'pass', date_trunc('day', now()) + interval '12 hours', '{}'),
       (CURRENT_DATE, '/unrelated/', 'indexability', 'fail', date_trunc('day', now()) + interval '22 hours', '{}');
     INSERT INTO geo_referral_daily_metrics
       (observation_date, platform, users, new_users, visits, pageviews, landing_path, imported_at)
     VALUES (CURRENT_DATE, 'chatgpt_search', 2, 1, 2, 3, '/services/crm/', date_trunc('day', now()) + interval '13 hours')`,
  );
    const date = new Date().toISOString().slice(0, 10);
    const overview = await repository.getOverview({ from: date, to: date, platform: "chatgpt_search", mode: "live_ui",
    language: "ru", region: "RU", topicId: fixture.topicId });
    assert.deepEqual(overview.sample, { runs: 1, prompts: 1, observations: 3, requiredRepetitions: 3 });
    assert.deepEqual(overview.citationRate, { numerator: 3, denominator: 3, value: 1 });
    assert.equal(overview.freshness.platforms.length, 1);
    assert.equal(overview.freshness.platforms[0]?.platform, "chatgpt_search");
    assert.equal(overview.freshness.platforms[0]?.run?.status, "failed");
    assert.equal(overview.freshness.platforms[0]?.run?.startedAt.getUTCHours(), 21);
    assert.equal(overview.freshness.crawler.checks, 1);
    assert.equal(overview.freshness.crawler.failed, 0);
    assert.equal(new Date(overview.freshness.crawler.lastCheckedAt!).getUTCHours(), 12);
    assert.equal(new Date(overview.freshness.referrals.lastImportedAt!).getUTCHours(), 13);
    const otherPlatform = await repository.getOverview({ from: date, to: date, platform: "yandex_alice", mode: "live_ui",
    language: "ru", region: "RU", topicId: fixture.topicId });
    assert.equal(otherPlatform.freshness.referrals.lastImportedAt, null);
    const listed = await repository.listObservations({ from: date, to: date, limit: 10, cursor: null });
    assert.equal(listed.items.length, 3);
    assert.equal(Object.hasOwn(listed.items[0], "responseSnapshot"), false);
    assert.equal(JSON.stringify(listed).includes("PRIVATE-"), false);
  },
);

databaseTest(
  "GEO promotion requires evidence and permits only one active experiment per page and prompt set",
  async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.pool.end());
    const repository = createGeoRepository(createDb(TEST_DATABASE_URL));
    await fixture.pool.query("DELETE FROM geo_runs");
    for (const [runIndex, startedAt] of ["2026-07-01T10:00:00Z", "2026-07-08T10:00:00Z", "2026-07-15T10:00:00Z"].entries()) {
    const runId = randomUUID();
    await fixture.pool.query(
      `INSERT INTO geo_runs
        (id, platform, surface, mode, region, language, status, started_at, completed_at, prompt_ids,
         planned_count, completed_count, stored_count, initiated_by_mcp_token_id, prompt_set_fingerprint)
       VALUES ($1, 'chatgpt_search', 'search', 'live_ui', 'RU', 'ru', 'success', $2, $2,
         ARRAY[$3]::uuid[], 3, 3, 3, $4, $5)`,
      [runId, startedAt, fixture.promptId, fixture.tokenId, "b".repeat(64)],
    );
    for (const repetition of [1, 2, 3]) await fixture.pool.query(
      `INSERT INTO geo_observations
        (run_id, prompt_id, repetition, mentioned, linked, cited, response_excerpt, response_snapshot,
         response_hash, source_count, session_personalized, observed_at)
       VALUES ($1, $2, $3, false, false, false, '', '', $4, 0, false, $5)`,
      [runId, fixture.promptId, repetition, String(runIndex + repetition + 1).repeat(64), startedAt],
    );
  }
    const recommendation = await fixture.pool.query<{ id: string }>(
    `INSERT INTO seo_recommendations
      (title, rationale, page_path, issue_type, evidence, confidence, fingerprint, created_by_mcp_token_id)
     VALUES ('GEO gap', 'Нет цитирования', '/services/crm/', 'geo_visibility_gap', $1::jsonb, 'high', $2, $3)
     RETURNING id`,
    [JSON.stringify({
      source: "geo_observations", metric: "citation_rate", period: { from: "2026-07-01", to: "2026-07-31" },
      dimensions: { platform: "chatgpt_search", mode: "live_ui", language: "ru", region: "RU", promptSetFingerprint: "b".repeat(64) },
      promptIds: [fixture.promptId],
    }), "a".repeat(64), fixture.tokenId],
  );
    const change = await fixture.pool.query<{ id: string }>(
    `INSERT INTO seo_changes (page_path, summary, type, applied_at, actor_admin_user_id)
     VALUES ('/services/crm/', 'Добавлен прямой ответ', 'content', '2026-08-01T10:00:00Z', $1)
     RETURNING id`,
    [fixture.adminId],
  );
    const command = {
    recommendationId: recommendation.rows[0].id,
    pagePath: "/services/crm/",
    actionType: "content_answer" as const,
    hypothesis: "Прямой ответ повысит цитирование",
    platform: "chatgpt_search" as const,
    mode: "live_ui" as const,
    language: "ru",
    region: "RU",
    promptIds: [fixture.promptId],
    promptSetFingerprint: "b".repeat(64),
    primaryMetric: "citation_rate" as const,
    direction: "increase" as const,
    minimumDelta: 0.05,
    evaluationWindows: [7, 14, 28],
    expectedSignal: "Рост на 5 п.п.",
  };
    const fabricated = await fixture.pool.query<{ id: string }>(
    `INSERT INTO seo_recommendations
      (title, rationale, page_path, issue_type, evidence, confidence, fingerprint, created_by_mcp_token_id)
     VALUES ('Непроверенный GEO сигнал', 'Произвольный JSON', '/services/crm/', 'geo_visibility_gap',
       '{"anything":true}'::jsonb, 'high', $1, $2) RETURNING id`,
    ["e".repeat(64), fixture.tokenId],
  );
    await assert.rejects(repository.createExperimentCandidate({ ...command, recommendationId: fabricated.rows[0].id },
    { mcpTokenId: fixture.tokenId }), /geo_experiment_recommendation_invalid/u);
    const first = await repository.createExperimentCandidate(command, { mcpTokenId: fixture.tokenId });
    const second = await repository.createExperimentCandidate(command, { mcpTokenId: fixture.tokenId });
    await repository.approveExperiment({ id: first.id }, { adminUserId: fixture.adminId });
    await repository.approveExperiment({ id: second.id }, { adminUserId: fixture.adminId });
    await repository.linkExperimentChange({ id: first.id, seoChangeId: change.rows[0].id }, { adminUserId: fixture.adminId });
    await assert.rejects(
      repository.linkExperimentChange({ id: second.id, seoChangeId: change.rows[0].id }, { adminUserId: fixture.adminId }),
      (error: unknown) => {
        if (typeof error !== "object" || error === null) return false;
        if ("code" in error && error.code === "23505") return true;
        return (
          "cause" in error && typeof error.cause === "object" && error.cause !== null
        && "code" in error.cause && error.cause.code === "23505"
        );
      },
    );
    await assert.rejects(repository.evaluateExperiment({ id: first.id, milestone: 14,
    evaluatedAt: new Date("2026-08-16T00:00:00Z") }, { mcpTokenId: fixture.tokenId }), /geo_experiment_milestone_order_invalid/u);
    await repository.evaluateExperiment({ id: first.id, milestone: 7, evaluatedAt: new Date("2026-08-09T00:00:00Z") }, { mcpTokenId: fixture.tokenId });
    await assert.rejects(repository.evaluateExperiment({ id: first.id, milestone: 7,
    evaluatedAt: new Date("2026-08-10T00:00:00Z") }, { mcpTokenId: fixture.tokenId }), /geo_experiment_milestone_order_invalid/u);
    await repository.evaluateExperiment({ id: first.id, milestone: 14, evaluatedAt: new Date("2026-08-16T00:00:00Z") }, { mcpTokenId: fixture.tokenId });
    const evaluation = await repository.evaluateExperiment({ id: first.id, milestone: 28,
    evaluatedAt: new Date("2026-08-30T00:00:00Z") }, { mcpTokenId: fixture.tokenId });
    assert.equal(evaluation.evaluation.verdict, "inconclusive");
    assert.equal(evaluation.experiment.status, "completed");
    await assert.rejects(repository.evaluateExperiment({ id: first.id, milestone: 14,
    evaluatedAt: new Date("2026-09-01T00:00:00Z") }, { mcpTokenId: fixture.tokenId }), /geo_experiment_state_invalid/u);
  },
);

databaseTest("official AI referrals and complete crawler checks form measurable experiment baselines", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.pool.end());
  const repository = createGeoRepository(createDb(TEST_DATABASE_URL));
  const fingerprint = createHash("sha256").update(fixture.promptId, "utf8").digest("hex");
  const dimensions = { platform: "chatgpt_search", mode: "live_ui", language: "ru", region: "RU",
    promptSetFingerprint: fingerprint };
  await fixture.pool.query(
    `INSERT INTO geo_referral_daily_metrics
      (observation_date, platform, users, new_users, visits, pageviews, landing_path)
     VALUES ('2026-07-15', 'chatgpt_search', 10, 5, 12, 14, '/services/crm/')`,
  );
  await fixture.pool.query(
    `INSERT INTO seo_collection_runs
      (source, requested_from, requested_to, status, completed_at, received_count, stored_count, metadata)
     VALUES ('yandex_metrika', '2026-07-01', '2026-07-31', 'success', now(), 1, 1,
       '{"completedSlices":1,"failedSlices":0}'::jsonb)`,
  );
  const incompleteRecommendation = await fixture.pool.query<{ id: string }>(
    `INSERT INTO seo_recommendations
      (title, rationale, page_path, issue_type, evidence, confidence, fingerprint, created_by_mcp_token_id)
     VALUES ('Неподтверждённые AI-переходы', 'Старый запуск Метрики не подтверждает GEO-срез', '/services/crm/',
       'geo_official_signal', $1::jsonb, 'high', $2, $3) RETURNING id`,
    [JSON.stringify({ source: "geo_referrals", metric: "ai_referrals", period: { from: "2026-07-01", to: "2026-07-31" },
      dimensions, promptIds: [fixture.promptId] }), "9".repeat(64), fixture.tokenId],
  );
  await assert.rejects(repository.createExperimentCandidate({
    recommendationId: incompleteRecommendation.rows[0].id, pagePath: "/services/crm/", actionType: "first_party_evidence",
    hypothesis: "Проверяем покрытие", platform: "chatgpt_search", mode: "live_ui", language: "ru", region: "RU",
    promptIds: [fixture.promptId], promptSetFingerprint: fingerprint, primaryMetric: "ai_referrals",
    direction: "increase", minimumDelta: 0.05, evaluationWindows: [7, 14, 28], expectedSignal: "Рост",
  }, { mcpTokenId: fixture.tokenId }), /geo_experiment_recommendation_invalid/u);
  for (const [from, to, status] of [
    ["2026-07-01", "2026-07-14", "success"],
    ["2026-07-15", "2026-07-28", "partial"],
    ["2026-07-29", "2026-07-31", "success"],
  ] as const) await fixture.pool.query(
    `INSERT INTO seo_collection_runs
      (source, requested_from, requested_to, status, completed_at, received_count, stored_count, metadata)
     VALUES ('yandex_metrika', $1, $2, $3, now(), 1, 1,
       '{"completedSlices":1,"failedSlices":1,"slices":{"traffic":"failed","aiReferrals":"success"}}'::jsonb)`,
    [from, to, status],
  );
  for (let day = 4; day <= 31; day++) await fixture.pool.query(
    `INSERT INTO geo_crawler_checks (check_date, target, bot, status, http_status, metadata)
     VALUES ($1, '/services/crm/', 'indexability', 'pass', 200, '{}'::jsonb)`,
    [`2026-07-${String(day).padStart(2, "0")}`],
  );
  const change = await fixture.pool.query<{ id: string }>(
    `INSERT INTO seo_changes (page_path, summary, type, applied_at, actor_admin_user_id)
     VALUES ('/services/crm/', 'Проверяемое GEO-изменение', 'content', '2026-08-01T10:00:00Z', $1)
     RETURNING id`, [fixture.adminId],
  );
  for (const metric of ["ai_referrals", "crawler_health"] as const) {
    const source = metric === "ai_referrals" ? "geo_referrals" : "geo_crawler";
    const period = metric === "ai_referrals" ? { from: "2026-07-01", to: "2026-07-31" }
      : { from: "2026-07-04", to: "2026-07-31" };
    const recommendation = await fixture.pool.query<{ id: string }>(
      `INSERT INTO seo_recommendations
        (title, rationale, page_path, issue_type, evidence, confidence, fingerprint, created_by_mcp_token_id)
       VALUES ($1, 'Официальные данные полны', '/services/crm/', 'geo_official_signal', $2::jsonb, 'high', $3, $4)
       RETURNING id`,
      [`GEO ${metric}`, JSON.stringify({ source, metric, period, dimensions, promptIds: [fixture.promptId] }),
        (metric === "ai_referrals" ? "c" : "d").repeat(64), fixture.tokenId],
    );
    const experiment = await repository.createExperimentCandidate({
      recommendationId: recommendation.rows[0].id, pagePath: "/services/crm/", actionType: "first_party_evidence",
      hypothesis: "Измеримый сигнал изменится", platform: "chatgpt_search", mode: "live_ui", language: "ru", region: "RU",
      promptIds: [fixture.promptId], promptSetFingerprint: fingerprint, primaryMetric: metric,
      direction: "increase", minimumDelta: 0.05, evaluationWindows: [7, 14, 28], expectedSignal: "Измеримый рост",
    }, { mcpTokenId: fixture.tokenId });
    await repository.approveExperiment({ id: experiment.id }, { adminUserId: fixture.adminId });
    const active = await repository.linkExperimentChange({ id: experiment.id, seoChangeId: change.rows[0].id },
      { adminUserId: fixture.adminId });
    const baseline = active.baseline as { value: number; sample: number; complete: boolean; unit: string };
    assert.equal(baseline.complete, true);
    assert.equal(baseline.unit, metric === "ai_referrals" ? "visits" : "ratio");
    assert.equal(baseline.value, metric === "ai_referrals" ? 12 : 1);
    await fixture.pool.query("UPDATE geo_experiments SET status = 'completed' WHERE id = $1", [experiment.id]);
  }
});
