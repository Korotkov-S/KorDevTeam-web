import { build } from "esbuild";

await build({
  entryPoints: ["scripts/content-release.ts"],
  outfile: "build/content-release/content-release.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: false,
});
