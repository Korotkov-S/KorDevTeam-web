# GEO platform recovery implementation plan

> Execute inline under the owner's November 26 repair request. Use superpowers:executing-plans.

**Goal:** Recover a confirmed available platform whose inherited blocked jobs have no resumable run owned by the current token.

**Architecture:** Extend the existing claim operation with an explicit optional recovery request. It creates one fresh managed question, retaining blocked siblings until a complete success. Default claims never retry blocked work.

**Tech stack:** TypeScript, Drizzle/PostgreSQL, existing MCP tools.

**Spec:** docs/operations/geo-collection-protocol.md and the owner's explicit repair request.

## Constraints and review focus

- Retain 18 sends/6 questions per Moscow day, per-send reservation, 15-minute leases and ownership checks.
- Recover only platform_unavailable/browser_unavailable, never login/CAPTCHA/confirmation blocks.
- One fresh question (three independent answers), no copying old observations or resetting siblings before success.
- Reject incomplete/unknown recovery parameters; save reason, time and previous error in run metadata.
- Empty budget or no matching blocked work creates no run; revoked tokens remain rejected.

## Implementation

- [x] Add database regressions for an inherited block without an owned resumable run, isolation of other platforms and default behavior; run and observe failure.
- [x] Add service validation and MCP schema for optional recovery {platform,reason}; require limit=1 and reject unsafe recovery input.
- [x] Implement selection of one blocked temporary/unavailable job under the existing queue lock and budget guard; always create a fresh run and preserve old observations/history.
- [x] Run repository/service/MCP tests against a disposable kordev_test database and typecheck.
- [ ] Document manual-only recovery, verify changes, commit and prepare the release for review; retain production content protection gates.
