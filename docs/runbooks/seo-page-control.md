# Published-page control and indexing evidence

Open `/admin/seo/pages/`. The full article/case/service registry is independent of impressions, assigned keywords and collected index samples. Pagination retains filters. Indexing states show the latest attempt, last successful evidence and freshness for the current published version. Older evidence remains available and is not replaced by a provider failure.

`server/seo-index-audit-import.mjs` accepts one secret-free schemaVersion 2 indexing audit JSON through stdin (maximum 8 MiB). It selects explicit public evidence and appends immutable observations in a transaction. Identical reimports are idempotent; a changed observation with the same content/source/timestamp fails closed. Neither import nor page viewing calls search APIs, submits indexing requests or changes content/core/budgets.

After completing a daily official read-only audit, run the importer inside the verified **active** web container, selected through the unique `# current-slot: blue|green` marker in the protected deployment route (not a fixed color). Verify that the container's image and revision match recorded immutable deployment state before executing. Example after resolving and validating `active_slot` in the trusted operations shell:

```bash
docker exec -i "kordevteam-$active_slot" node server/seo-index-audit-import.mjs < /path/to/secret-free-indexing-audit.json
```

For a Mac-local audit, pipe the file over the existing authorized SSH connection to that exact command; no file copy or environment output is needed. Record inserted/unchanged counts locally. Do not mark a daily synchronization complete if the importer returns nonzero. Preserve the local report and retry only this idempotent import, not the paid collector or the already completed free audit.

SchemaVersion 1 historical audits lack per-source checkedAt and confirmed publishedVersion. Keep those files as original local evidence; do not invent timestamps or versions to import them. Version 2 reports from 2026-10-07 onward carry both fields.

All evidence timestamps are strict ISO calendar dates. Current observations must match the current published record. Earlier versions require the corresponding published revision snapshot with the same identity and public path; a draft revision is not publication evidence. Import never rewrites a historical observation.

Source completeness and known indexing status are separate counts. A failed latest attempt decreases completed checks and increments errors, but retains any fresh last successful status in both the card and the indexed/excluded/conflict totals. Those totals must not be added to errors as mutually exclusive categories.

The registry is current, while search metrics use the selected period/source/device/region. Exact controls display their actual dates and compare only compatible full matrices, as on the Positions screen. Unchecked is not outside top-100. Missing Yandex samples are unconfirmed, not exclusion. Google canonical divergence is a distinct state. Intentional noindex is counted separately. A successful indexing request or completed recrawl task is not proof of indexing.
