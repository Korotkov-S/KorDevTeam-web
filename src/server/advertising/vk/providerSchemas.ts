import { z } from "zod";

const boundedString = (maximum: number) => z.string().min(1).max(maximum);
const nullableString = (maximum: number) => boundedString(maximum).nullable().optional();
const externalId = z.union([
  boundedString(160),
  z.number().int().nonnegative().safe(),
]).transform((value) => String(value));
const timestamp = z.string().min(1).max(80).refine((value) => Number.isFinite(Date.parse(value)));
const nullableTimestamp = timestamp.nullable().optional();
const decimal = z.union([
  z.string().regex(/^\d{1,18}(?:\.\d{1,6})?$/u),
  z.number().finite().nonnegative(),
]).transform((value) => String(value));
const count = z.union([
  z.string().regex(/^\d{1,20}$/u),
  z.number().int().nonnegative().safe(),
]).transform((value) => String(value));
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const schedule = z.object({
  date_from: calendarDate.nullable().optional(),
  date_to: calendarDate.nullable().optional(),
  timezone: boundedString(80).nullable().optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  hours: z.array(z.number().int().min(0).max(23)).max(24).optional(),
}).strip();

export const vkAdsAccountWireSchema = z.object({
  id: externalId,
  account_type: nullableString(80),
  name: nullableString(240),
  currency: nullableString(12),
  timezone: nullableString(80),
  updated: nullableTimestamp,
}).strip();

export const vkAdsCampaignWireSchema = z.object({
  id: externalId,
  account_id: externalId,
  name: boundedString(500),
  status: boundedString(80),
  objective: nullableString(120),
  campaign_type: nullableString(120),
  budget: decimal.nullable().optional(),
  schedule: schedule.optional().default({}),
  created: nullableTimestamp,
  updated: nullableTimestamp,
}).strip();

export const vkAdsAdGroupWireSchema = z.object({
  id: externalId,
  account_id: externalId,
  ad_plan_id: externalId,
  name: boundedString(500),
  status: boundedString(80),
  package: nullableString(240),
  optimization: nullableString(240),
  bid_strategy: nullableString(240),
  targeting_labels: z.array(boundedString(240)).max(100).optional().default([]),
  created: nullableTimestamp,
  updated: nullableTimestamp,
}).strip();

const vkAdsCreativeWireSchema = z.object({
  media_kind: z.enum(["image", "video"]),
  format: nullableString(120),
  text_blocks: z.array(z.string().max(4_000)).max(100).optional().default([]),
  cta: nullableString(240),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  duration_seconds: z.number().int().nonnegative().nullable().optional(),
  content_ids: z.array(externalId).max(100).optional().default([]),
  image_url: z.string().max(8_192).nullable().optional(),
  video_url: z.string().max(8_192).nullable().optional(),
}).strip();

export const vkAdsAdWireSchema = z.object({
  id: externalId,
  account_id: externalId,
  ad_plan_id: externalId,
  ad_group_id: externalId,
  name: boundedString(500),
  status: boundedString(80),
  moderation_status: nullableString(80),
  moderation_reason_code: nullableString(160),
  landing_url: z.string().max(8_192).nullable().optional(),
  created: nullableTimestamp,
  updated: nullableTimestamp,
  creative: vkAdsCreativeWireSchema,
}).strip();

export const vkAdsMetricWireSchema = z.object({
  id: externalId,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  timezone: boundedString(80),
  spend: decimal,
  impressions: count,
  reach: count,
  clicks: count,
  conversions: z.record(z.string().max(160), z.union([z.string().max(240), z.number().finite(), z.boolean(), z.null()]))
    .superRefine((value, context) => {
      if (Buffer.byteLength(JSON.stringify(value), "utf8") > 16_384) {
        context.addIssue({ code: "custom", message: "conversions are too large" });
      }
    }),
  revision: nullableString(160),
}).strip();

export function vkAdsPageWireSchema<T extends z.ZodType>(item: T) {
  return z.object({
    count: z.number().int().nonnegative().safe(),
    items: z.array(item).max(250),
    next_offset: z.number().int().nonnegative().safe().nullable().optional(),
    account: vkAdsAccountWireSchema.optional(),
  }).strip();
}

export const vkAdsStatisticsWireSchema = z.object({
  items: z.array(vkAdsMetricWireSchema).max(100_000),
}).strip();

export const vkAdsProviderErrorWireSchema = z.object({
  error: boundedString(160),
}).strip();
