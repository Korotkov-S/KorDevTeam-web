import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { GEO_PROMPT_CATEGORIES, GEO_PROMPT_STATUSES, type GeoPromptCatalogEntry } from "./contracts";
import { normalizeGeoPrompt, normalizeGeoTargetPath } from "./normalization";

const entrySchema = z.object({
  promptText: z.string().trim().min(1).max(2000),
  topic: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
    name: z.string().trim().min(1).max(160),
    targetPath: z.string().trim().min(1).max(500),
  }).strict(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20),
  category: z.enum(GEO_PROMPT_CATEGORIES),
  language: z.string().trim().min(2).max(16),
  region: z.string().trim().min(2).max(120),
  targetPath: z.string().trim().min(1).max(500),
  linkedSeoQuery: z.string().trim().min(1).max(2000).nullable(),
  priority: z.number().int().min(0).max(1000),
  status: z.enum(GEO_PROMPT_STATUSES).refine((value) => value !== "archived"),
}).strict();

export function parseGeoPromptCatalog(value: unknown): GeoPromptCatalogEntry[] {
  if (!Array.isArray(value)) throw new Error("geo_prompt_catalog_invalid");
  let parsed: z.infer<typeof entrySchema>[];
  try {
    parsed = value.map((entry) => entrySchema.parse(entry));
  } catch {
    throw new Error("geo_prompt_catalog_invalid");
  }
  let result: GeoPromptCatalogEntry[];
  try {
    result = parsed.map((entry) => ({
      ...entry,
      normalizedText: normalizeGeoPrompt(entry.promptText),
      targetPath: normalizeGeoTargetPath(entry.targetPath),
      topic: { ...entry.topic, targetPath: normalizeGeoTargetPath(entry.topic.targetPath) },
    })) as GeoPromptCatalogEntry[];
  } catch {
    throw new Error("geo_prompt_catalog_invalid");
  }
  const keys = new Set<string>();
  for (const entry of result) {
    const key = `${entry.normalizedText}\u0000${entry.language}\u0000${entry.region}`;
    if (keys.has(key)) throw new Error("geo_prompt_catalog_duplicate");
    keys.add(key);
  }
  if (result.length < 40 || result.length > 60) throw new Error("geo_prompt_catalog_invalid");
  return result;
}

const defaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../content/seo/geo-prompts.ru.json");

export function loadGeoPromptCatalog(catalogPath = defaultPath): GeoPromptCatalogEntry[] {
  try {
    return parseGeoPromptCatalog(JSON.parse(readFileSync(catalogPath, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("geo_prompt_catalog_")) throw error;
    throw new Error("geo_prompt_catalog_invalid");
  }
}
