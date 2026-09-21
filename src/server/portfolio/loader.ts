import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import type { ValidatedContentCommand } from "../content/types";
import { parseContentCommand } from "../content/types";
import { portfolioCaseSource, type PortfolioCaseSource } from "./schema";

const DEFAULT_PORTFOLIO_ROOT = path.resolve(process.cwd(), "content/portfolio/cases");
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+7|8)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/;
const SECRET_PATTERN = /\b(?:kus_live_[a-z0-9_-]+|api[_-]?key|token)\b/i;
const MONEY_PATTERN = /(?:\bбюджет\b.{0,40}\d|\d[\d\s.,]{2,}.{0,20}(?:₽|руб(?:лей|ля|ль)?\.?))/i;
const NDA_ORGANIZATION_PATTERN = /(?:^|[^\p{L}])(?:газпром(?:нефт[\p{L}-]*)?|роснефт[\p{L}-]*|сбер(?:банк[\p{L}-]*)?)(?:$|[^\p{L}])/iu;

function validationError(code: string, cause?: unknown): Error {
  return new Error(code, cause === undefined ? undefined : { cause });
}

export function toPortfolioCommand(record: PortfolioCaseSource): ValidatedContentCommand {
  const catalogOrder = record.catalogOrder === undefined ? {} : { catalogOrder: record.catalogOrder };
  return parseContentCommand({
    kind: "case",
    slug: record.slug,
    title: record.title,
    excerpt: record.excerpt,
    bodyMd: record.bodyMd,
    seoTitle: record.seoTitle,
    seoDescription: record.seoDescription,
    indexable: record.indexable,
    payload: {
      ...record.payload,
      categories: record.categories,
      catalogVisible: record.catalogVisible ?? true,
      ...catalogOrder,
    },
  });
}

function validatePublicMaterial(record: PortfolioCaseSource): void {
  const serialized = JSON.stringify(toPortfolioCommand(record));
  const disallowedEmails = serialized.match(EMAIL_PATTERN)?.filter(email => email.toLowerCase() !== "team@korotkov.dev") ?? [];
  if (disallowedEmails.length || PHONE_PATTERN.test(serialized) || SECRET_PATTERN.test(serialized) || MONEY_PATTERN.test(serialized)) {
    throw validationError("portfolio_private_data");
  }
  if (record.slug === "notion-analog" && NDA_ORGANIZATION_PATTERN.test(serialized)) {
    throw validationError("portfolio_nda_violation");
  }
}

export function validatePortfolioSources(records: readonly PortfolioCaseSource[]): PortfolioCaseSource[] {
  const parsed = records.map(record => {
    const result = portfolioCaseSource.safeParse(record);
    if (!result.success) throw validationError("portfolio_source_invalid", result.error);
    return result.data;
  });
  const uniqueFields = ["slug", "seoTitle", "seoDescription"] as const;
  for (const field of uniqueFields) {
    const seen = new Set<string>();
    for (const record of parsed) {
      const value = record[field].trim().toLocaleLowerCase("ru");
      if (seen.has(value)) throw validationError("portfolio_duplicate");
      seen.add(value);
    }
  }
  for (const record of parsed) validatePublicMaterial(record);
  return parsed;
}

export async function loadPortfolioSources(root = DEFAULT_PORTFOLIO_ROOT): Promise<PortfolioCaseSource[]> {
  const boundedRoot = await realpath(root);
  const entries = await readdir(boundedRoot, { withFileTypes: true });
  const jsonEntries = entries.filter(entry => entry.name.endsWith(".json"));
  const records: PortfolioCaseSource[] = [];
  for (const entry of jsonEntries) {
    if (!entry.isFile() || entry.isSymbolicLink()) throw validationError("portfolio_source_forbidden");
    const filePath = path.join(boundedRoot, entry.name);
    const metadata = await lstat(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw validationError("portfolio_source_forbidden");
    const resolved = await realpath(filePath);
    if (path.dirname(resolved) !== boundedRoot) throw validationError("portfolio_source_forbidden");
    let value: unknown;
    try {
      value = JSON.parse(await readFile(resolved, "utf8"));
    } catch (error) {
      throw validationError("portfolio_source_invalid_json", error);
    }
    const parsed = portfolioCaseSource.safeParse(value);
    if (!parsed.success) throw validationError("portfolio_source_invalid", parsed.error);
    if (`${parsed.data.slug}.json` !== entry.name) throw validationError("portfolio_filename_mismatch");
    records.push(parsed.data);
  }
  return validatePortfolioSources(records).sort((left, right) => left.slug.localeCompare(right.slug, "en"));
}
