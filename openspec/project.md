# Project

KorDevTeam web site built with React, Vite, TypeScript, React Router, Tailwind-style utility classes, and Cypress-style e2e specs.

## Conventions

- Prefer existing project patterns and components.
- Keep e2e specs in `cypress/e2e/*.cy.ts`.
- External site checks currently target `https://kordev.team`.
- Do not touch unrelated generated content or public assets while adding tests.
- Use Russian-facing assertions where the live page defaults to Russian, with English fallbacks when language can vary.

## Verification

- Run focused e2e checks when Cypress is installed/configured.
- Run project build when relevant and practical.
- Document blocked checks in the implementation summary.
