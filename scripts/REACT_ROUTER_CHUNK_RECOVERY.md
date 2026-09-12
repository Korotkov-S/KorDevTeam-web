# React Router 7.9.4 route-import recovery

The installed `react-router/dist/development/chunk-OIYGIGL5.mjs` contains
`loadRouteModule`, which catches dynamic import failures and directly reloads
the document. Global error listeners alone cannot prevent its reload loop.

`react-router-chunk-recovery.mjs` is a Vite pre-transform for production builds.
It changes only that function's catch block. A confirmed route-import failure
delegates to the synchronous `window.__kordevRecoverChunk` hook installed by the
SSR head script. The hook records the release SHA in sessionStorage before the
first reload. Subsequent failures (or unavailable storage/hook) resolve a cached
module whose component throws a safe Russian error during rendering, allowing
the already-loaded root error boundary to recover. Resolving the module is
necessary because this router version's single-fetch strategy discards lazy
import rejection results and otherwise leaves the route in an empty fallback.
Global dynamic-import errors and Vite preload errors share the same decision.
Development HMR retains the upstream implementation.

The package remains pinned at 7.9.4. The transform checks that version and the
SHA-256 of the complete upstream handler:
`7dab3a200ea1f09cb5bf71a973c669f4c90999d79a6869a6df2186dd5e580a6b`.
Unexpected upstream changes or a client build that never applies the transform
fail the build. No generated bundle or node_modules file is edited in place.
On any framework update, review the upstream handler, update the lock only after
review, and rerun the installed-handler and real-browser regression tests.

Validation:

- `src/lib/routerChunkRecovery.test.ts` executes the actual installed/patched
  handler with a real failed dynamic import, and checks one reload followed by
  a cached recovery component that throws safely. It also checks version/hash
  drift rejection.
- `tests/ssr/chunkRecovery.test.ts` aborts the built blog-index module during
  navigation from the video page. It verifies one document reload, no second
  reload for the same release, and the visible Russian root error boundary.
