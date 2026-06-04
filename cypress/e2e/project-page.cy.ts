/// <reference types="cypress" />

describe('Media & Entertainment project page', () => {
  beforeEach(() => {
    // Set viewport for consistent testing
    cy.viewport(1280, 720);
  });

  it('opens successfully and displays project title', () => {
    // Visit the project page with encoded URL
    cy.visit('https://kordev.team/project/Media%20&%20Entertainment');
    // Ensure the page loads (wait for heading)
    cy.get('h1').should('be.visible');
    // Check that the project identifier is present in the page
    cy.contains('Media & Entertainment').should('exist');
    // Optional: check that a known element from the page is present, e.g., the back button
    cy.contains('Назад к проектам').should('exist'); // Russian text for back button
  });
});