import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VERSION = "7.9.4";
const HANDLER_SHA256 = "7dab3a200ea1f09cb5bf71a973c669f4c90999d79a6869a6df2186dd5e580a6b";
const MODULE_SUFFIX = "/react-router/dist/development/chunk-OIYGIGL5.mjs";

export function patchRouteModuleImports(source, version = require("react-router/package.json").version) {
  if (version !== VERSION) throw new Error("Review the React Router chunk-recovery patch before changing its pinned version");
  const start = source.indexOf("async function loadRouteModule(");
  const end = source.indexOf("\n// lib/dom/ssr/links.ts", start);
  const original = source.slice(start, end);
  if (start < 0 || end < 0 || createHash("sha256").update(original).digest("hex") !== HANDLER_SHA256) {
    throw new Error("React Router route-import implementation changed; review the chunk-recovery patch");
  }
  const catchStart = original.indexOf("  } catch (error) {");
  const patched = original.slice(0, catchStart) + `  } catch (error) {
    if (window.__kordevRecoverChunk?.()) {
      return new Promise(() => {});
    }
    // Resolve lazy route properties: single-fetch drops lazy rejection results.
    // Throw during rendering instead, where the loaded root boundary catches it.
    let recoveryModule = {
      default: function RouteChunkRecovery() {
        throw new Error("Не удалось загрузить страницу");
      }
    };
    routeModulesCache[route.id] = recoveryModule;
    return recoveryModule;
  }
}
`;
  return source.slice(0, start) + patched + source.slice(end);
}

export function reactRouterChunkRecovery() {
  let serverBuild = false;
  let patched = false;
  return {
    name: "kordev-react-router-7.9.4-chunk-recovery",
    enforce: "pre",
    apply: "build",
    configResolved(config) { serverBuild = Boolean(config.build.ssr); },
    buildStart() { patched = false; },
    transform(source, id) {
      if (!id.replace(/\\/g, "/").endsWith(MODULE_SUFFIX)) return null;
      const code = patchRouteModuleImports(source);
      patched = true;
      return { code, map: null };
    },
    buildEnd(error) {
      if (!error && !serverBuild && !patched) throw new Error("React Router chunk-recovery patch was not applied to the client build");
    },
  };
}
