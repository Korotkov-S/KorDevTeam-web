ALTER TABLE "geo_runs" ADD COLUMN "prompt_ids" uuid[];--> statement-breakpoint
UPDATE "geo_runs" AS r
   SET "prompt_ids" = COALESCE((
         SELECT array_agg(DISTINCT o."prompt_id" ORDER BY o."prompt_id")
           FROM "geo_observations" AS o
          WHERE o."run_id" = r."id"
       ), ARRAY[]::uuid[]);--> statement-breakpoint
UPDATE "geo_runs" AS r
       SET "status" = CASE
         WHEN r."status" = 'running' OR cardinality(r."prompt_ids") = 0 THEN 'failed'::geo_run_status
         WHEN r."status" = 'success' AND NOT (
           cardinality(r."prompt_ids") BETWEEN 1 AND 333
           AND (SELECT count(*) FROM "geo_observations" o WHERE o."run_id" = r."id") = cardinality(r."prompt_ids") * 3
           AND NOT EXISTS (
             SELECT 1
               FROM "geo_observations" o
              WHERE o."run_id" = r."id"
              GROUP BY o."prompt_id"
             HAVING count(*) <> 3 OR count(DISTINCT o."repetition") <> 3
           )
         ) THEN 'failed'::geo_run_status
         ELSE r."status"
       END,
       "error_code" = CASE
         WHEN r."status" = 'running' OR cardinality(r."prompt_ids") = 0 OR (r."status" = 'success' AND NOT (
           cardinality(r."prompt_ids") BETWEEN 1 AND 333
           AND (SELECT count(*) FROM "geo_observations" o WHERE o."run_id" = r."id") = cardinality(r."prompt_ids") * 3
           AND NOT EXISTS (
             SELECT 1
               FROM "geo_observations" o
              WHERE o."run_id" = r."id"
              GROUP BY o."prompt_id"
             HAVING count(*) <> 3 OR count(DISTINCT o."repetition") <> 3
           )
         )) THEN COALESCE(r."error_code", 'geo_legacy_run_incomplete')
         ELSE r."error_code"
       END,
       "completed_at" = CASE
         WHEN r."status" = 'running' OR cardinality(r."prompt_ids") = 0 THEN COALESCE(r."completed_at", now())
         ELSE r."completed_at"
       END,
       "prompt_set_fingerprint" = COALESCE((
         SELECT encode(sha256(string_agg(convert_to(prompt_id::text, 'UTF8'), decode('00', 'hex') ORDER BY prompt_id)), 'hex')
           FROM unnest(r."prompt_ids") AS prompt_id
       ), r."prompt_set_fingerprint"),
       "planned_count" = cardinality(r."prompt_ids") * 3,
       "completed_count" = (SELECT count(*)::int FROM "geo_observations" o WHERE o."run_id" = r."id"),
       "stored_count" = (SELECT count(*)::int FROM "geo_observations" o WHERE o."run_id" = r."id");--> statement-breakpoint
ALTER TABLE "geo_runs" ALTER COLUMN "prompt_ids" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "geo_runs" ADD CONSTRAINT "geo_runs_prompt_ids_bounded" CHECK ("geo_runs"."status" = 'failed' OR cardinality("geo_runs"."prompt_ids") BETWEEN 1 AND 333);--> statement-breakpoint
ALTER TABLE "geo_runs" ADD CONSTRAINT "geo_runs_plan_matches_prompts" CHECK ("geo_runs"."planned_count" = cardinality("geo_runs"."prompt_ids") * 3);
