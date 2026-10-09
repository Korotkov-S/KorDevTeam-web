# Human-approved SEO recommendation execution

Migration 0024 adds an execution ledger; it does not approve old accepted cards, publish anything or backfill unknown history. An `accepted` status alone is not publication authority.

## Owner and agent workflow

1. Read the current card/history and published snapshot through MCP. Prepare the exact `executionPlan` with `revise_seo_recommendation`, guarded by `expectedUpdatedAt`; this changes only the proposal. Keep evidence within its existing16KiB limit and the plan within262144 UTF-8 bytes. Do not put article text into evidence.
2. The owner reviews the full before/after diff, page/version and criteria in either existing admin surface. The publication-consent button records a real cookie-authenticated administrator and freezes the exact plan/card/page atomically. A stale form fails closed. Unsupported cards can only be accepted for consideration, without execution authority.
3. On the existing heartbeat, paginate `list_seo_recommendation_work` to completion. It lists all accepted cards regardless of creation date, including blocked legacy and applied work. Use its opaque cursor unchanged; dates/offset cursors belong to other tools.
4. Read each with `get_seo_recommendation_work`. For `ready`, call `apply_seo_recommendation` with only `recommendationId`, `executionId` and the frozen `approvedRecommendation.updatedAt` as `expectedUpdatedAt`. The server uses the approved patch, not newly supplied text. Actor is the authenticated MCP token, never a caller-supplied administrator.
5. For `applied`, inspect the real public result and provide one truthful `{criterionId, excerpt, sourceUrl}` per approved criterion to `complete_seo_recommendation`. The server independently checks HTTP/SSR identity, version, metadata, canonical, robots and excerpts, then guards the database again. Only confirmed completion changes the card to `implemented` and appends verification history.

Do not use generic `publish_content`, `record_seo_change` or status/revise/CLI to manufacture completion. The shared CMS writer already records the actual new version and its SEO change in the same transaction. No second journal event is needed. `implemented` means verified application of the agreed action, not search indexing, canonical resolution in Google, causality or position growth.

## Scopes and recovery

| Tool | Required scopes |
| --- | --- |
| list/get work | seo:read, content:read |
| apply | seo:read, seo:write, content:read, content:write, content:publish |
| complete | seo:read, seo:write, content:read |

No token is automatically upgraded. Refresh the existing MCP connection after release if its schema is stale; the owner must explicitly authorize missing scopes outside the chat. No new account/token is required by this implementation, and secrets must not be pasted into messages.

A lost apply response is recovered by reading the execution ledger. Identical replay returns saved application without a new version; already applied work proceeds only to verification. Identical completed replay returns the saved proof. A different completion payload conflicts instead of overwriting evidence. Failed verification retains the accepted/applied facts and a separate safe failed-attempt entry; it never republishes. Subsequent manual page/card edits block the old execution rather than overwrite newer content or claim current success.

Before application, a changed proposal requires an explicit **Согласовать обновлённый вариант** click. A changed source page requires preparing a fresh plan from its actual version/hash first. Reapproval supersedes but preserves the previous approval. Once applied, no reapproval/republication button is offered. Rejection changes only proposal status and does not execute it.

## Hash, limits and boundaries

`baseHash` is SHA-256 of the exact JSON-safe published snapshot returned by get: lexicographically sorted object keys, unchanged array order, ISO dates, normalized relations/media refs. No sparse arrays, accessors, non-finite values, prototypes or prototype keys. Do not invent future `updatedAt` or a result hash: the server hashes the actual saved row.

Only one existing published article/case/service and the exact allowlisted fields are supported. No slug, canonical, indexability, dates, provenance, media changes, settings, core activation, budgets, provider calls, indexing submissions or schedule changes. Missing plan/authority, conflicts and unsupported actions remain blocked for a concrete owner decision. Linked GEO experiments retain human approval, compatible baseline gates and the14-day per-page interval, independent of prompt set/status.

Public verification is bounded to the trusted HTTPS origin, four requests at most (three same-origin redirects), ten seconds total,2MiB HTML and the exact approved final URL; no credentials/cookies, paid API or search request. SSR markers come from the same entry used to render. A criterion excerpt is evidence of visible text, not an automated judgment of its factual truth: the agent and owner remain responsible for factual accuracy.

## Release acceptance

Run the complete dedicated-test-database suite, typecheck, build and db:check; review the whole application range independently before merge. Deploy only the successful exact-SHA immutable manifest through the existing main workflow/backup/release gates. Verify the sole exact current-slot marker, regular non-symlink mode0600 slot record, immutable digest, Config.Image/image ID, OCI revision/checkout, healthy and public SSR markers. Compare read-only content/core/raw-observation/recommendation baselines; no production test approval/publication.

Update only the existing `seo` heartbeat after verified release and read-only MCP discovery. Preserve its other stages, daily dedupe, schedule, notification policy, limits and target thread. If client schema/scopes remain unavailable, keep execution fail-closed, report the required owner action once, and continue independent monitoring without workaround publication.
