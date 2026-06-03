# E2E Blog Navigation

## Purpose

Define regression coverage for opening blog articles from the blog index.

## Requirements

### Requirement: Blog article navigation

The site SHALL allow a visitor to open blog articles from the blog index and land on the corresponding article page.

#### Scenario: Opening article links from the blog index

- **GIVEN** a visitor opens the blog index at `/blog`
- **WHEN** the visitor selects a visible blog article link
- **THEN** the browser SHALL navigate to that article's `/blog/<slug>` route
- **AND** the destination page SHALL render a visible article heading
- **AND** the destination page SHALL render visible article content
