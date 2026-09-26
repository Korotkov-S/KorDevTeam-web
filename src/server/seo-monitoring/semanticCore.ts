import { readFileSync } from "node:fs";
import path from "node:path";

import { normalizeSeoQuery, normalizeSitePath } from "./normalization";

const frequencyBands = new Set(["high", "medium", "low", "unclassified"] as const);
const queryKinds = new Set(["commercial", "informational", "other"] as const);

export type SemanticCoreEntry = {
  queryText: string;
  normalizedQuery: string;
  targetPath: string;
  wordstatFrequency: number;
  frequencyBand: "high" | "medium" | "low" | "unclassified";
  kind: "commercial" | "informational" | "other";
  priority: number;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("seo_semantic_core_entry_invalid");
  return value as Record<string, unknown>;
}

function integer(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) throw new Error(code);
  return value as number;
}

export function parseSemanticCore(value: unknown): SemanticCoreEntry[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 60) throw new Error("seo_semantic_core_size_invalid");
  const normalizedQueries = new Set<string>();
  return value.map((item) => {
    const source = record(item);
    const queryText = typeof source.queryText === "string" ? source.queryText.trim() : "";
    if (!queryText || queryText.length > 500) throw new Error("seo_semantic_core_query_invalid");
    const normalizedQuery = normalizeSeoQuery(queryText);
    if (normalizedQueries.has(normalizedQuery)) throw new Error("seo_semantic_core_duplicate");
    normalizedQueries.add(normalizedQuery);
    if (typeof source.targetPath !== "string" || !source.targetPath.startsWith("/")) {
      throw new Error("seo_semantic_core_target_invalid");
    }
    const targetPath = normalizeSitePath(source.targetPath);
    if (targetPath !== source.targetPath.trim()) throw new Error("seo_semantic_core_target_invalid");
    const wordstatFrequency = integer(source.wordstatFrequency, Number.MAX_SAFE_INTEGER, "seo_semantic_core_frequency_invalid");
    if (typeof source.frequencyBand !== "string" || !frequencyBands.has(source.frequencyBand as never)) {
      throw new Error("seo_semantic_core_band_invalid");
    }
    if (typeof source.kind !== "string" || !queryKinds.has(source.kind as never)) {
      throw new Error("seo_semantic_core_kind_invalid");
    }
    const priority = integer(source.priority, 1_000, "seo_semantic_core_priority_invalid");
    return {
      queryText,
      normalizedQuery,
      targetPath,
      wordstatFrequency,
      frequencyBand: source.frequencyBand as SemanticCoreEntry["frequencyBand"],
      kind: source.kind as SemanticCoreEntry["kind"],
      priority,
    };
  });
}

export function loadSemanticCore(filePath = path.resolve("content/seo/semantic-core.ru.json")): SemanticCoreEntry[] {
  let source: unknown;
  try {
    source = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("seo_semantic_core_source_invalid");
  }
  return parseSemanticCore(source);
}
