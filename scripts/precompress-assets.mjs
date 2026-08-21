import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const COMPRESSIBLE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg", ".xml"]);
const MINIMUM_SIZE = 1_024;

async function listFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
        } else if (entry.isFile()) {
          files.push(entryPath);
        }
      }),
    );
  }

  await visit(root);
  return files;
}

export async function precompressDirectory(root) {
  const files = await listFiles(root);
  const candidates = [];

  for (const filePath of files) {
    if (!COMPRESSIBLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;
    const stat = await fs.stat(filePath);
    if (stat.size < MINIMUM_SIZE) continue;
    candidates.push(filePath);
  }

  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    await Promise.all(
      batch.map(async (filePath) => {
        const input = await fs.readFile(filePath);
        const [brotli, gzipped] = await Promise.all([
          brotliCompressAsync(input, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: 5,
            },
          }),
          gzipAsync(input, { level: 9 }),
        ]);

        await Promise.all([
          fs.writeFile(`${filePath}.br`, brotli),
          fs.writeFile(`${filePath}.gz`, gzipped),
        ]);
      }),
    );
  }

  return { compressedFiles: candidates.length };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const distRoot = path.resolve(process.argv[2] || "dist");
  const target = path.join(distRoot, "assets");
  const result = await precompressDirectory(target);
  console.log(`Precompressed ${result.compressedFiles} files in ${target}`);
}
