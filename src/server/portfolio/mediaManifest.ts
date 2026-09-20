import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const common = {
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  output: z.string().regex(/^\/projects\/portfolio\/[a-z0-9-]+\/cover\.webp$/),
  alt: z.string().trim().min(1),
  viewport: z.strictObject({ width: z.number().int().min(320).max(3840), height: z.number().int().min(320).max(2160) }),
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
};

export const portfolioMediaItem = z.discriminatedUnion("mode", [
  z.strictObject({
    ...common,
    mode: z.literal("capture"),
    sourceUrl: z.url(),
    selector: z.string().trim().min(1).optional(),
    dismissText: z.string().trim().min(1).max(80).optional(),
  }),
  z.strictObject({ ...common, mode: z.literal("existing"), sourcePath: z.string().regex(/^public\/[a-zA-Z0-9_./-]+\.(?:webp|png|jpe?g)$/) }),
  z.strictObject({ ...common, mode: z.literal("fallback") }),
]);

export type PortfolioMediaItem = z.output<typeof portfolioMediaItem>;

export async function loadPortfolioMediaManifest(
  filename = path.resolve(process.cwd(), "content/portfolio/media.json"),
): Promise<PortfolioMediaItem[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    throw new Error("portfolio_media_manifest_invalid", { cause: error });
  }
  const parsed = z.array(portfolioMediaItem).safeParse(raw);
  if (!parsed.success) throw new Error("portfolio_media_manifest_invalid", { cause: parsed.error });
  const slugs = new Set<string>();
  for (const item of parsed.data) {
    if (slugs.has(item.slug) || item.output !== `/projects/portfolio/${item.slug}/cover.webp`) {
      throw new Error("portfolio_media_manifest_invalid");
    }
    if (item.mode === "existing" && item.sourcePath.split("/").includes("..")) {
      throw new Error("portfolio_media_manifest_invalid");
    }
    slugs.add(item.slug);
  }
  return parsed.data;
}
