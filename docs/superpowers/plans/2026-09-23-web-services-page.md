# Web Services Commercial Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/services/web-services/` into a professional, SEO-oriented commercial page for custom web services, personal accounts, and B2B portals without overloading the shared service design.

**Architecture:** Keep the existing data-driven `ServicePage` and enrich only the `web-services` source record. Add slug-specific headings in the shared template so the page speaks the language of this service while all other services retain their current presentation.

**Tech Stack:** React 18, TypeScript, React Router, Node test runner, PostgreSQL content sync.

**Spec:** Approved in the conversation on 2026-09-23: one canonical page covering web services, personal accounts, and B2B portals with needs, solution types, business effect, integrations, delivery process, pricing factors, cases, and SEO FAQ.

## Global Constraints

- Preserve all unrelated dirty-worktree changes.
- Do not create thin duplicate landing pages for the three search clusters.
- Keep expert explanations compact and use the established disclosure pattern for long copy.
- Use factual commercial wording; do not invent fixed prices or guaranteed outcomes.
- Keep the current `MVP — от 8 недель` time estimate.

## Review Focus

- The web-services slug receives its own headings while generic and CRM pages remain unchanged.
- The page still renders when optional expert arrays are empty.
- FAQ questions are unique across the entire service catalog.
- SEO metadata stays within the schema limits and naturally includes the primary query.
- The content sync remains idempotent after the new FAQ records are added.

---

### Task 1: Specify the web-services presentation

**Files:**
- Modify: `src/pages/ServicePage.test.tsx`
- Modify: `src/server/content/commercialServices.test.ts`

**Interfaces:**
- Consumes: `ServicePageView` and `loadCommercialServiceSources()`.
- Produces: behavioral expectations for web-services headings, solution types, metadata, and FAQ coverage.

- [x] Add a component test rendering `/services/web-services/` with readiness, benefits, solution types, integrations, process, price, cases, and results.
- [x] Assert the service-specific headings and absence of automation/CRM-only headings.
- [x] Add a source test for the H1, metadata, arrays, integrations, and FAQ questions.
- [x] Run the two test files and confirm failure because the web-services-specific content and headings do not exist.

### Task 2: Implement the approved content and headings

**Files:**
- Modify: `content/services.ru.json`
- Modify: `src/pages/ServicePage.tsx`
- Modify: `docs/seo/semantic-research-2026-09.md`

**Interfaces:**
- Consumes: the approved page structure and existing payload fields.
- Produces: a complete `web-services` source record and slug-specific presentation branches.

- [x] Add `isWebServices` and select headings for readiness, benefits, solution types, scope, integrations, process, price, cases, and results.
- [x] Replace the web-services source with the approved H1, lead, needs, benefits, solution types, scope, integrations, technologies, process, price factors, outcomes, guarantees, and expanded FAQ.
- [x] Record the keyword cluster and SERP content decisions in the SEO research document.
- [x] Run the focused component and source tests until green.

### Task 3: Sync and verify the production-shaped page

**Files:**
- No additional source files expected.

**Interfaces:**
- Consumes: `content/services.ru.json` through `yarn content:services`.
- Produces: the updated published local database record rendered by the production server.

- [x] Sync commercial service content into the local PostgreSQL database.
- [x] Run typecheck, production build, focused tests, and the commercial browser/SSR suite.
- [x] Restart the local production server and visually inspect `/services/web-services/` at desktop and mobile widths.
- [x] Confirm SEO metadata and section order from the rendered page.
