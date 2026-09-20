import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LEGACY_PROJECT_DECISIONS,
  legacyProjectRedirect,
} from "../../src/server/http/legacyProject";

type LegacyDecisionRow = {
  path: string;
  action: string;
  target: string | null;
};

function normalizeProjectPath(pathname: string): string {
  const escaped = pathname.replace(/%[0-9a-f]{2}/gi, value => value.toUpperCase());
  return `${escaped.replace(/\/+$/, "")}/`;
}

async function readLegacyDecisionTable(pathname: string): Promise<LegacyDecisionRow[]> {
  const source = await readFile(pathname, "utf8").catch(() => "");
  return source
    .split("\n")
    .filter(line => /^\|\s*`\/project\//.test(line))
    .map(line => {
      const cells = line.split("|").slice(1, -1).map(cell => cell.trim().replace(/^`|`$/g, ""));
      return { path: cells[0], action: cells[1], target: cells[2] === "—" ? null : cells[2] };
    });
}

async function discoverRepositoryLegacyPaths(): Promise<string[]> {
  const projects = JSON.parse(await readFile("public/content/projects.ru.json", "utf8")) as Array<{ id: string }>;
  const projectPaths = projects.map(({ id }) => {
    const slug = id === "Media & Entertainment" ? "media-entertainment" : id;
    return normalizeProjectPath(`/project/${slug}`);
  });

  const redirects = await readFile("public/_redirects", "utf8");
  const redirectPaths = redirects
    .split("\n")
    .map(line => line.trim().split(/\s{2,}/)[0])
    .filter(pathname => pathname?.startsWith("/project/") && !pathname.includes("*"))
    .map(normalizeProjectPath);

  const inventory = await readFile("docs/seo/public-route-inventory.md", "utf8");
  assert.match(inventory, /`\/project\/:slug\/`\s*\|\s*Legacy redirect/);

  return [...new Set([...projectPaths, ...redirectPaths])].sort();
}

test("repository inventory, decision document and runtime allowlist stay identical", async () => {
  const rows = await readLegacyDecisionTable("docs/seo/legacy-url-decisions.md");
  const documentedPaths = rows.map(row => row.path).sort();
  assert.deepEqual(documentedPaths, await discoverRepositoryLegacyPaths());
  assert.equal(new Set(documentedPaths).size, documentedPaths.length);
  assert.ok(rows.every(row => ["keep", "redirect", "noindex", "gone"].includes(row.action)));
  assert.ok(rows.filter(row => row.action === "redirect").every(row => row.target?.startsWith("/cases/") && row.target.endsWith("/")));

  const documented = rows
    .map(row => [row.path, row.action, row.target] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const runtime = Object.entries(LEGACY_PROJECT_DECISIONS)
    .map(([path, decision]) => [path, decision.action, decision.target ?? null] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(documented, runtime);
});

test("approved GET and HEAD redirects work with browser, wildcard or missing Accept", async () => {
  for (const method of ["GET", "HEAD"]) {
    for (const accept of ["text/html", "*/*", undefined]) {
      const headers = accept ? { accept } : undefined;
      const target = await legacyProjectRedirect(new Request(
        "https://kordev.team/project/web-site/?utm_source=test&deploy=bad",
        { method, headers },
      ));
      assert.equal(target?.href, "https://kordev.team/cases/alliance-stroy-garant/?utm_source=test", `${method} ${accept ?? "no Accept"}`);
    }
  }
});

test("legacy project ids redirect straight to canonical portfolio slugs", async () => {
  const expected = new Map([
    ["media-entertainment", "noodome"],
    ["web-site", "alliance-stroy-garant"],
    ["web-service", "sims-dynasty-tree"],
    ["harmonize-me", "harmonize-me"],
    ["stroyrem", "stroyrem"],
    ["wowbanner", "wowbanner"],
    ["serviceplus", "serviceplus"],
    ["amch", "amch"],
    ["notion-analog", "notion-analog"],
  ]);

  for (const [legacy, canonical] of expected) {
    const target = await legacyProjectRedirect(new Request(`https://kordev.team/project/${legacy}/`));
    assert.equal(target?.pathname, `/cases/${canonical}/`, legacy);
  }

  const noodome = JSON.parse(await readFile("content/portfolio/cases/noodome.json", "utf8")) as { legacySlugs: string[] };
  assert.deepEqual(noodome.legacySlugs, ["media-entertainment"]);
});

test("static redirect fixture sends every documented legacy project directly to its canonical case", async () => {
  const rows = await readLegacyDecisionTable("docs/seo/legacy-url-decisions.md");
  const redirects = new Map((await readFile("public/_redirects", "utf8"))
    .split("\n")
    .map(line => line.trim().split(/\s{2,}/))
    .filter(cells => cells.length === 3 && cells[0]?.startsWith("/project/") && cells[2] === "301!")
    .map(cells => [normalizeProjectPath(cells[0]!), cells[1]!]));

  for (const row of rows) assert.equal(redirects.get(row.path), row.target, row.path);
});

test("legacy decisions reject mutation methods and never infer unknown project paths", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(await legacyProjectRedirect(new Request(
      "https://kordev.team/project/web-site/",
      { method, headers: { accept: "text/html" } },
    )), null);
  }
  assert.equal(await legacyProjectRedirect(new Request(
    "https://kordev.team/project/new-published-case/",
    { headers: { accept: "text/html" } },
  )), null);
});
