/// <reference types="cypress" />

describe("Blog page navigation", () => {
  const siteUrl = "https://kordev.team";

  beforeEach(() => {
    cy.viewport(1280, 720);
  });

  it("opens blog articles from the blog index on a new page", () => {
    cy.visit(`${siteUrl}/blog`);
    cy.location("pathname").should("eq", "/blog");
    cy.contains("h2", /Блог|Blog/).should("be.visible");

    cy.get('a[href^="/blog/"]:visible').then(($links) => {
      const hrefs = [...$links]
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href))
        .slice(0, 3);

      expect(hrefs, "visible blog article links").to.have.length.greaterThan(0);

      hrefs.forEach((href) => {
        cy.visit(`${siteUrl}/blog`);
        cy.get(`a[href="${href}"]:visible`).first().click();

        cy.location("pathname").should("eq", href);
        cy.get("h1").should("be.visible");
        cy.get("article").should("be.visible");
      });
    });
  });
});
