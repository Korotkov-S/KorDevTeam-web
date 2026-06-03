# Design: Blog navigation e2e coverage

## Approach

Create a Cypress e2e spec in `cypress/e2e/blog-page.cy.ts`.

The test opens `https://kordev.team/blog`, collects visible article links matching `/blog/<slug>`, and clicks a small sample of links. For each clicked link, it asserts that:

- `location.pathname` equals the link href.
- A visible `h1` exists on the destination page.
- A visible `article` exists on the destination page.

## Rationale

Using the visible links from the index keeps the spec resilient to blog ordering changes while still exercising the real navigation behavior. Sampling the first three visible articles keeps runtime bounded and catches regressions in the shared card/link behavior.

## Risks

- The test depends on the live `https://kordev.team` site being reachable.
- Cypress is not currently declared in `package.json`, so local execution requires an existing Cypress setup or an added dependency in a separate change.
