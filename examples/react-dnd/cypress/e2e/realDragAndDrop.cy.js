/// <reference types="cypress" />

/**
 * Self-test for cypress-real-dnd against a react-dnd HTML5-backend app.
 * Each `it` exercises one path of the option API so a regression in any
 * branch fails its own test.
 */

const TOLERANCE = 30; // pixel slop allowed for position assertions (drag scale, sub-pixel rounding)

const within = (expected, actual, tol = TOLERANCE) =>
  Math.abs(actual - expected) <= tol;

describe("cypress-real-dnd", { retries: 0 }, () => {
  before(() => {
    // Required: settle Cypress's CDP listeners before the first drag fires.
    cy.task("cdpRealDragInit");
  });

  beforeEach(() => {
    cy.visit("/");
    cy.get('[data-cy="canvas-empty"]').should("be.visible");
  });

  it("default (center → center): drops a widget on the canvas", () => {
    cy.realDragAndDrop('[data-cy="widget-card-button"]', '[data-cy="canvas"]');
    cy.get('[data-cy="placed-button"]')
      .should("be.visible")
      .and("contain.text", "Button");
    cy.get('[data-cy="placed-count"]').should("contain.text", "Dropped: 1");
  });

  it("targetPosition keyword: drops at the canvas's topLeft", () => {
    cy.realDragAndDrop('[data-cy="widget-card-text"]', '[data-cy="canvas"]', {
      targetPosition: "topLeft",
    });
    cy.get('[data-cy="placed-text"]').then(($el) => {
      const x = parseInt($el.attr("data-x"), 10);
      const y = parseInt($el.attr("data-y"), 10);
      // top-left of the canvas should be near (0,0) of the drop
      expect(within(0, x), `x near 0 (got ${x})`).to.be.true;
      expect(within(0, y), `y near 0 (got ${y})`).to.be.true;
    });
  });

  it("targetPosition keyword: drops at the canvas's bottomRight", () => {
    cy.realDragAndDrop('[data-cy="widget-card-card"]', '[data-cy="canvas"]', {
      targetPosition: "bottomRight",
    });
    cy.get('[data-cy="canvas"]').then(($canvas) => {
      const rect = $canvas[0].getBoundingClientRect();
      cy.get('[data-cy="placed-card"]').then(($el) => {
        const x = parseInt($el.attr("data-x"), 10);
        const y = parseInt($el.attr("data-y"), 10);
        expect(
          within(rect.width, x),
          `x near canvas.width=${Math.round(rect.width)} (got ${x})`,
        ).to.be.true;
        expect(
          within(rect.height, y),
          `y near canvas.height=${Math.round(rect.height)} (got ${y})`,
        ).to.be.true;
      });
    });
  });

  it("targetX/Y pixel offsets: drops at an exact canvas position", () => {
    cy.realDragAndDrop('[data-cy="widget-card-button"]', '[data-cy="canvas"]', {
      targetX: 180,
      targetY: 240,
    });
    cy.get('[data-cy="placed-button"]').then(($el) => {
      const x = parseInt($el.attr("data-x"), 10);
      const y = parseInt($el.attr("data-y"), 10);
      expect(within(180, x), `x near 180 (got ${x})`).to.be.true;
      expect(within(240, y), `y near 240 (got ${y})`).to.be.true;
    });
  });

  it("mixed: sourcePosition keyword + targetX/Y pixels", () => {
    cy.realDragAndDrop('[data-cy="widget-card-text"]', '[data-cy="canvas"]', {
      sourcePosition: "center",
      targetX: 320,
      targetY: 120,
    });
    cy.get('[data-cy="placed-text"]').then(($el) => {
      const x = parseInt($el.attr("data-x"), 10);
      const y = parseInt($el.attr("data-y"), 10);
      expect(within(320, x), `x near 320 (got ${x})`).to.be.true;
      expect(within(120, y), `y near 120 (got ${y})`).to.be.true;
    });
  });

  it("multiple drops accumulate", () => {
    cy.realDragAndDrop('[data-cy="widget-card-button"]', '[data-cy="canvas"]', {
      targetX: 100,
      targetY: 100,
    });
    cy.realDragAndDrop('[data-cy="widget-card-text"]', '[data-cy="canvas"]', {
      targetX: 300,
      targetY: 200,
    });
    cy.realDragAndDrop('[data-cy="widget-card-card"]', '[data-cy="canvas"]', {
      targetX: 500,
      targetY: 300,
    });
    cy.get('[data-cy="placed-count"]').should("contain.text", "Dropped: 3");
    cy.get('[data-cy="placed-button"]').should("exist");
    cy.get('[data-cy="placed-text"]').should("exist");
    cy.get('[data-cy="placed-card"]').should("exist");
  });

  it("cy.realDrag low-level: drops at explicit viewport coords", () => {
    cy.get('[data-cy="widget-card-button"]').then(($source) => {
      cy.get('[data-cy="canvas"]').then(($canvas) => {
        const s = $source[0].getBoundingClientRect();
        const c = $canvas[0].getBoundingClientRect();
        cy.realDrag({
          fromX: Math.round(s.left + s.width / 2),
          fromY: Math.round(s.top + s.height / 2),
          toX: Math.round(c.left + 150),
          toY: Math.round(c.top + 150),
        });
      });
    });
    cy.get('[data-cy="placed-button"]').then(($el) => {
      const x = parseInt($el.attr("data-x"), 10);
      const y = parseInt($el.attr("data-y"), 10);
      expect(within(150, x), `x near 150 (got ${x})`).to.be.true;
      expect(within(150, y), `y near 150 (got ${y})`).to.be.true;
    });
  });

  it("invalid position keyword throws with a useful message", () => {
    cy.on("fail", (err) => {
      expect(err.message).to.match(
        /Unknown position "middle"|topLeft, top, topRight/,
      );
      return false;
    });
    cy.realDragAndDrop(
      '[data-cy="widget-card-button"]',
      '[data-cy="canvas"]',
      { targetPosition: "middle" },
    );
  });

  it("cy.realDragRewarm: re-primes after navigation so a cold drag still lands", () => {
    // Re-navigate to load a fresh document, which leaves the intercept stale
    // (the "No Input.dragIntercepted" cold-miss scenario this command fixes).
    cy.visit("/");
    cy.get('[data-cy="canvas-empty"]').should("be.visible");
    // Proactively re-prime the pipeline on the freshly-loaded document.
    cy.realDragRewarm();
    // A drag fired immediately after the re-warm should land normally.
    cy.realDragAndDrop('[data-cy="widget-card-button"]', '[data-cy="canvas"]', {
      targetX: 200,
      targetY: 160,
    });
    cy.get('[data-cy="placed-button"]').then(($el) => {
      const x = parseInt($el.attr("data-x"), 10);
      const y = parseInt($el.attr("data-y"), 10);
      expect(within(200, x), `x near 200 (got ${x})`).to.be.true;
      expect(within(160, y), `y near 160 (got ${y})`).to.be.true;
    });
  });
});
