# Proposal: Add blog navigation e2e coverage

## Intent

Add an executable e2e specification that verifies blog cards on the live site open article pages through a real user navigation flow.

## Scope

- Add a Cypress spec for the `/blog` index.
- Use visible blog article links from the page instead of hardcoding every current article.
- Verify that clicking a link changes the route to `/blog/<slug>`.
- Verify that the destination page renders an article heading and article content.

## Out of Scope

- Changing blog UI behavior.
- Changing blog content, generated indexes, sitemap files, or public images.
- Installing Cypress or adding new npm/yarn dependencies.

## Impact

The project gains regression coverage for the blog index to article-page navigation path.
