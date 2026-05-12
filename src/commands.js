/**
 * cypress-real-drag-drop / commands
 *
 * Browser-side Cypress commands. Import this from your support file once and
 * the `cy.realDragAndDrop` + `cy.realDrag` commands become available
 * everywhere.
 *
 *   // cypress/support/e2e.js
 *   import 'cypress-real-drag-drop/commands';
 *
 * Usage:
 *
 *   before(() => cy.task('cdpRealDragInit'));
 *
 *   it('moves a card', () => {
 *     cy.realDragAndDrop('[data-cy=card-1]', '[data-cy=column-done]');
 *   });
 *
 *   // Lower-level coord-based API:
 *   cy.realDrag({ fromX: 100, fromY: 200, toX: 600, toY: 400 });
 */

/**
 * High-level: drag from one selector's center to another selector's center
 * (or to a specific position inside the target).
 *
 * @param {string} sourceSelector  CSS selector for the drag source.
 * @param {string} targetSelector  CSS selector for the drop target.
 * @param {object} [options]
 * @param {number} [options.targetX]  X offset inside the target (defaults to center).
 * @param {number} [options.targetY]  Y offset inside the target (defaults to center).
 * @param {number} [options.sourceX]  X offset inside the source (defaults to center).
 * @param {number} [options.sourceY]  Y offset inside the source (defaults to center).
 */
Cypress.Commands.add(
  "realDragAndDrop",
  (sourceSelector, targetSelector, options = {}) => {
    cy.get(sourceSelector).then(($source) => {
      cy.get(targetSelector).then(($target) => {
        const s = $source[0].getBoundingClientRect();
        const t = $target[0].getBoundingClientRect();
        const fromX = Math.round(
          s.left + (options.sourceX ?? s.width / 2),
        );
        const fromY = Math.round(
          s.top + (options.sourceY ?? s.height / 2),
        );
        const toX = Math.round(t.left + (options.targetX ?? t.width / 2));
        const toY = Math.round(t.top + (options.targetY ?? t.height / 2));
        cy.task(
          "cdpRealDrag",
          { fromX, fromY, toX, toY },
          { timeout: 15000 },
        );
      });
    });
  },
);

/**
 * Low-level: drag between explicit AUT-relative coords.
 * Useful when the drop target is a canvas-style surface without a single
 * element you can select, or when you want to drop at a precise position
 * computed from custom logic.
 *
 * @param {object} coords
 * @param {number} coords.fromX
 * @param {number} coords.fromY
 * @param {number} coords.toX
 * @param {number} coords.toY
 */
Cypress.Commands.add("realDrag", (coords) => {
  cy.task("cdpRealDrag", coords, { timeout: 15000 });
});
