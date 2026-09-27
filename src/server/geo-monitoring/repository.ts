import { and, eq, sql } from "drizzle-orm";

import type { createDb } from "../db/client";
import {
  geoCitations,
  geoCrawlerChecks,
  geoEntities,
  geoFanoutQueries,
  geoObservationMentions,
  geoObservations,
  geoPrompts,
  geoRuns,
  geoTopics,
  seoQueries,
} from "../db/schema";
import { normalizeSeoQuery } from "../seo-monitoring/normalization";
import type {
  GeoCitationCategory,
  GeoEntityStatus,
  GeoObservationInput,
  GeoPlatform,
  GeoPromptCatalogEntry,
  GeoPromptCategory,
  GeoPromptStatus,
  GeoRunMode,
} from "./contracts";

export type GeoDatabase = ReturnType<typeof createDb>;

export type GeoStartRunInput = {
  platform: GeoPlatform;
  surface: string;
  mode: GeoRunMode;
  region: string;
  language: string;
  plannedCount: number;
  promptSetFingerprint: string;
  metadata: Record<string, unknown>;
};

export type GeoFinishRunInput = {
  status: "success" | "partial" | "failed";
  completedCount: number;
  storedCount: number;
  errorCode: string | null;
  metadata: Record<string, unknown>;
};

export type StoredGeoCitation = {
  url: string;
  hostname: string;
  title?: string | null;
  sourceOrder: number;
  isOwned: boolean;
  category: GeoCitationCategory;
  localPath: string | null;
};

export type StoredGeoObservationInput = Omit<GeoObservationInput, "citations" | "observedAt"> & {
  observedAt?: Date;
  citations: StoredGeoCitation[];
};

export type GeoPromptCandidateInput = {
  promptText: string;
  normalizedText: string;
  topicId: string;
  tags: string[];
  category: GeoPromptCategory;
  priority: number;
  language: string;
  region: string;
  targetPath: string | null;
  seoQueryId?: string | null;
  expectedEntityDomain?: string | null;
  source?: string;
};

export type GeoPromptUpdateInput = Partial<GeoPromptCandidateInput> & {
  id: string;
  status?: GeoPromptStatus;
};

export type GeoEntityWriteInput = {
  id?: string;
  canonicalName: string;
  type: "owned" | "competitor";
  aliases: string[];
  domains: string[];
  status: GeoEntityStatus;
};

export type GeoCrawlerCheckInput = {
  checkDate: string;
  target: string;
  bot: string;
  status: "pass" | "fail" | "unavailable";
  reasonCode?: string | null;
  httpStatus?: number | null;
  checkedAt?: Date;
  metadata: Record<string, unknown>;
};

function assertOwnedRun(run: typeof geoRuns.$inferSelect | undefined, tokenId: string) {
  if (!run) throw new Error("geo_run_not_found");
  if (run.initiatedByMcpTokenId !== tokenId) throw new Error("geo_run_forbidden");
  if (run.status !== "running") throw new Error("geo_run_not_running");
  return run;
}

export function createGeoRepository(db: GeoDatabase) {
  return {
    async syncPromptCatalog(entries: readonly GeoPromptCatalogEntry[]) {
      return db.transaction(async (tx) => {
        const result = { inserted: 0, promoted: 0, preserved: 0 };
        for (const entry of entries) {
          let [topic] = await tx.select().from(geoTopics).where(eq(geoTopics.slug, entry.topic.slug)).limit(1);
          if (!topic) {
            [topic] = await tx.insert(geoTopics).values({
              name: entry.topic.name,
              slug: entry.topic.slug,
              targetPath: entry.topic.targetPath,
              priority: entry.priority,
              status: entry.status,
            }).returning();
          }
          if (!topic) throw new Error("geo_topic_not_found");

          let seoQueryId: string | null = null;
          if (entry.linkedSeoQuery) {
            const [seoQuery] = await tx.select({ id: seoQueries.id }).from(seoQueries)
              .where(eq(seoQueries.normalizedQuery, normalizeSeoQuery(entry.linkedSeoQuery))).limit(1);
            seoQueryId = seoQuery?.id ?? null;
          }
          const [existing] = await tx.select().from(geoPrompts).where(and(
            eq(geoPrompts.normalizedText, entry.normalizedText),
            eq(geoPrompts.language, entry.language),
            eq(geoPrompts.region, entry.region),
          )).limit(1);
          if (!existing) {
            await tx.insert(geoPrompts).values({
              promptText: entry.promptText,
              normalizedText: entry.normalizedText,
              topicId: topic.id,
              tags: entry.tags,
              category: entry.category,
              status: entry.status,
              priority: entry.priority,
              language: entry.language,
              region: entry.region,
              targetPath: entry.targetPath,
              seoQueryId,
              source: "catalog",
            });
            result.inserted++;
          } else if (existing.source === "catalog" && existing.status === "candidate" && entry.status === "active") {
            await tx.update(geoPrompts).set({ status: "active", updatedAt: new Date() })
              .where(eq(geoPrompts.id, existing.id));
            result.promoted++;
          } else {
            result.preserved++;
          }
        }
        return result;
      });
    },

    async createPromptCandidate(input: GeoPromptCandidateInput) {
      const [row] = await db.insert(geoPrompts).values({
        ...input,
        seoQueryId: input.seoQueryId ?? null,
        expectedEntityDomain: input.expectedEntityDomain ?? null,
        source: input.source ?? "mcp",
        status: "candidate",
      }).onConflictDoNothing({
        target: [geoPrompts.normalizedText, geoPrompts.language, geoPrompts.region],
      }).returning();
      if (row) return row;
      const [existing] = await db.select().from(geoPrompts).where(and(
        eq(geoPrompts.normalizedText, input.normalizedText),
        eq(geoPrompts.language, input.language),
        eq(geoPrompts.region, input.region),
      )).limit(1);
      if (!existing) throw new Error("geo_prompt_not_found");
      return existing;
    },

    async updatePrompt(input: GeoPromptUpdateInput) {
      const { id, ...values } = input;
      const [row] = await db.update(geoPrompts).set({ ...values, updatedAt: new Date() })
        .where(eq(geoPrompts.id, id)).returning();
      if (!row) throw new Error("geo_prompt_not_found");
      return row;
    },

    async updateEntity(input: GeoEntityWriteInput) {
      if (input.id) {
        const [row] = await db.update(geoEntities).set({
          canonicalName: input.canonicalName,
          type: input.type,
          aliases: input.aliases,
          domains: input.domains,
          status: input.status,
          updatedAt: new Date(),
        }).where(eq(geoEntities.id, input.id)).returning();
        if (!row) throw new Error("geo_entity_not_found");
        return row;
      }
      const [row] = await db.insert(geoEntities).values(input).onConflictDoUpdate({
        target: geoEntities.canonicalName,
        set: {
          type: input.type,
          aliases: input.aliases,
          domains: input.domains,
          status: input.status,
          updatedAt: new Date(),
        },
      }).returning();
      if (!row) throw new Error("geo_entity_not_found");
      return row;
    },

    async startRun(input: GeoStartRunInput, tokenId: string) {
      const [row] = await db.insert(geoRuns).values({
        ...input,
        initiatedByMcpTokenId: tokenId,
        status: "running",
      }).returning();
      if (!row) throw new Error("geo_run_not_started");
      return row;
    },

    async recordObservation(runId: string, tokenId: string, input: StoredGeoObservationInput) {
      return db.transaction(async (tx) => {
        const [run] = await tx.select().from(geoRuns).where(eq(geoRuns.id, runId)).for("update").limit(1);
        assertOwnedRun(run, tokenId);
        const [existing] = await tx.select().from(geoObservations).where(and(
          eq(geoObservations.runId, runId),
          eq(geoObservations.promptId, input.promptId),
          eq(geoObservations.repetition, input.repetition),
        )).limit(1);
        if (existing) return existing;

        const { mentions, citations, fanoutQueries, ...observation } = input;
        const [row] = await tx.insert(geoObservations).values({ ...observation, runId }).returning();
        if (!row) throw new Error("geo_observation_not_stored");
        if (mentions.length) {
          await tx.insert(geoObservationMentions).values(mentions.map((mention) => ({
            observationId: row.id,
            ...mention,
          })));
        }
        if (citations.length) {
          await tx.insert(geoCitations).values(citations.map((citation) => ({
            observationId: row.id,
            ...citation,
          })));
        }
        if (fanoutQueries.length) {
          await tx.insert(geoFanoutQueries).values(fanoutQueries.map((query) => ({
            observationId: row.id,
            ...query,
          })));
        }
        return row;
      });
    },

    async finishRun(runId: string, tokenId: string, input: GeoFinishRunInput) {
      return db.transaction(async (tx) => {
        const [run] = await tx.select().from(geoRuns).where(eq(geoRuns.id, runId)).for("update").limit(1);
        const ownedRun = assertOwnedRun(run, tokenId);
        const counted = await tx.select({ count: sql<number>`count(*)::int` }).from(geoObservations)
          .where(eq(geoObservations.runId, runId));
        const stored = counted[0]?.count ?? 0;
        if (input.storedCount !== stored || input.completedCount < stored || input.completedCount > ownedRun.plannedCount) {
          throw new Error("geo_run_counts_mismatch");
        }
        const [row] = await tx.update(geoRuns).set({
          ...input,
          completedAt: new Date(),
        }).where(eq(geoRuns.id, runId)).returning();
        if (!row) throw new Error("geo_run_not_found");
        if (input.status === "success") {
          await tx.execute(sql`
            INSERT INTO geo_entities (canonical_name, type, aliases, domains, status)
            SELECT lower(c.hostname), 'competitor'::geo_entity_type,
                   ARRAY[lower(c.hostname)]::text[], ARRAY[lower(c.hostname)]::text[],
                   'candidate'::geo_entity_status
              FROM geo_citations c
              JOIN geo_observations o ON o.id = c.observation_id
              JOIN geo_runs r ON r.id = o.run_id
             WHERE r.status = 'success'
               AND c.is_owned = false
               AND c.category = 'competitor'
             GROUP BY lower(c.hostname)
            HAVING count(DISTINCT r.id) >= 2
            ON CONFLICT (canonical_name) DO NOTHING
          `);
        }
        return row;
      });
    },

    async recordCrawlerChecks(input: readonly GeoCrawlerCheckInput[]) {
      if (!input.length) return 0;
      return db.transaction(async (tx) => {
        for (const check of input) {
          await tx.insert(geoCrawlerChecks).values(check).onConflictDoUpdate({
            target: [geoCrawlerChecks.checkDate, geoCrawlerChecks.target, geoCrawlerChecks.bot],
            set: {
              status: check.status,
              reasonCode: check.reasonCode ?? null,
              httpStatus: check.httpStatus ?? null,
              checkedAt: check.checkedAt ?? new Date(),
              metadata: check.metadata,
            },
          });
        }
        return input.length;
      });
    },
  };
}

export type GeoRepository = ReturnType<typeof createGeoRepository>;
