import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Build-time image optimization:
// - scans selected folders under /public
// - generates `.webp` next to `.png/.jpg/.jpeg` (keeps originals)
// - safe for static hosting + <picture> fallback in the UI

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");

const TARGET_DIRS = [
  path.join(PUBLIC_DIR, "projects"),
  path.join(PUBLIC_DIR, "blog", "uploads"),
  // Top-level assets (logos, etc.)
  PUBLIC_DIR,
];

const EXT_RE = /\.(png|jpe?g)$/i;

function toWebpPath(absPath) {
  return absPath.replace(/\.(png|jpe?g)$/i, ".webp");
}

async function fileExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listImagesRecursively(dir, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      // Avoid re-processing full /public/blog with markdown; we only want uploads.
      if (p === path.join(PUBLIC_DIR, "blog")) continue;
      await listImagesRecursively(p, out);
      continue;
    }

    if (EXT_RE.test(ent.name)) out.push(p);
  }
}

async function main() {
  // Lazy import so the script can be present even if deps aren't installed yet.
  let ImagePool;
  try {
    ({ ImagePool } = await import("@squoosh/lib"));
  } catch (e) {
    console.error(
      "[optimize-images] Missing dependency @squoosh/lib. Run `yarn install` (or `yarn add -D @squoosh/lib`).",
    );
    process.exitCode = 1;
    return;
  }

  const sources = [];
  for (const d of TARGET_DIRS) await listImagesRecursively(d, sources);

  // De-dup in case PUBLIC_DIR overlaps others
  const uniq = Array.from(new Set(sources));

  if (uniq.length === 0) {
    console.log("[optimize-images] No PNG/JPEG images found to optimize.");
    return;
  }

  const concurrency = Math.max(1, Math.min(4, os.cpus()?.length || 2));
  const pool = new ImagePool(concurrency);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const srcAbs of uniq) {
    const outAbs = toWebpPath(srcAbs);
    try {
      // Skip if output exists and is newer/equal
      if (await fileExists(outAbs)) {
        const [inSt, outSt] = await Promise.all([fs.stat(srcAbs), fs.stat(outAbs)]);
        if (outSt.mtimeMs >= inSt.mtimeMs) {
          skipped++;
          continue;
        }
      }

      const image = pool.ingestImage(srcAbs);
      await image.encode({
        webp: { quality: 78 },
      });
      const encoded = await image.encodedWith.webp;
      if (!encoded?.binary) throw new Error("no webp binary produced");

      await fs.writeFile(outAbs, encoded.binary);
      created++;
    } catch (e) {
      failed++;
      console.warn("[optimize-images] Failed:", path.relative(ROOT, srcAbs));
    }
  }

  await pool.close();

  console.log(
    `[optimize-images] Done. WebP created: ${created}, skipped: ${skipped}, failed: ${failed}`,
  );
}

main().catch((e) => {
  console.error("[optimize-images] Fatal error:", e);
  process.exitCode = 1;
});

