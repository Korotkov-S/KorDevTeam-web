import { z } from "zod";

import { caseCategory, casePayload } from "../content/types";

export const portfolioCategory = caseCategory;

export const evidence = z.strictObject({
  kind: z.enum(["google-doc", "google-sheet", "yougile", "public-url", "repository"]),
  locator: z.string().trim().min(1),
  supports: z.array(z.enum(["scope", "feature", "technology", "result", "identity", "media"])).min(1),
});

export const portfolioCaseSource = z.strictObject({
  schemaVersion: z.literal(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  legacySlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  title: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  bodyMd: z.string(),
  seoTitle: z.string().trim().min(1).max(180),
  seoDescription: z.string().trim().min(1).max(320),
  indexable: z.boolean(),
  categories: z.array(portfolioCategory).min(1),
  catalogOrder: z.number().int().positive().optional(),
  catalogVisible: z.boolean().optional(),
  payload: casePayload,
  evidence: z.array(evidence).min(1),
});

export type PortfolioCategory = z.output<typeof portfolioCategory>;
export type PortfolioEvidence = z.output<typeof evidence>;
export type PortfolioCaseSource = z.output<typeof portfolioCaseSource>;
