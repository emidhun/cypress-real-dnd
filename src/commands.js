/**
 * cypress-real-dnd / commands
 *
 * Browser-side Cypress commands. Import this from your support file once and
 * the `cy.realDragAndDrop` + `cy.realDrag` commands become available
 * everywhere.
 *
 *   // cypress/support/e2e.js
 *   import 'cypress-real-dnd/commands';
 *
 * Usage:
 *
 *   before(() => cy.task('cdpRealDragInit'));
 *
 *   it('moves a card', () => {
 *     cy.realDragAndDrop('[data-cy=card-1]', '[data-cy=column-done]');
 *   });
 *
 *   // With Cypress-style position keywords:
 *   cy.realDragAndDrop('[data-cy=card]', '[data-cy=col]', {
 *     sourcePosition: 'center',
 *     targetPosition: 'topLeft',
 *   });
 *
 *   // With precise pixel offsets inside each element:
 *   cy.realDragAndDrop('[data-cy=card]', '[data-cy=canvas]', {
 *     targetX: 250,
 *     targetY: 400,
 *   });
 *
 *   // Lower-level coord-based API:
 *   cy.realDrag({ fromX: 100, fromY: 200, toX: 600, toY: 400 });
 */

// Standard Cypress 9-keyword position set. A 1px inset on the right/bottom
// edges keeps drops inside the element's hit-test box — CSS treats `right`
// and `bottom` as exclusive, so a literal corner coord lands on the next
// element underneath.
const POSITION_KEYWORDS = {
  topLeft:     (r) => [0,             0],
  top:         (r) => [r.width / 2,   0],
  topRight:    (r) => [r.width - 1,   0],
  left:        (r) => [0,             r.height / 2],
  center:      (r) => [r.width / 2,   r.height / 2],
  right:       (r) => [r.width - 1,   r.height / 2],
  bottomLeft:  (r) => [0,             r.height - 1],
  bottom:      (r) => [r.width / 2,   r.height - 1],
  bottomRight: (r) => [r.width - 1,   r.height - 1],
};

function resolveOffset(rect, position, explicitX, explicitY) {
  // Explicit pixel offsets win when provided — most specific wins.
  if (explicitX !== undefined || explicitY !== undefined) {
    return [
      explicitX !== undefined ? explicitX : rect.width / 2,
      explicitY !== undefined ? explicitY : rect.height / 2,
    ];
  }
  if (position) {
    const fn = POSITION_KEYWORDS[position];
    if (!fn) {
      throw new Error(
        `[cypress-real-dnd] Unknown position "${position}". ` +
          `Valid: ${Object.keys(POSITION_KEYWORDS).join(", ")}.`,
      );
    }
    return fn(rect);
  }
  return [rect.width / 2, rect.height / 2];
}

/**
 * High-level: drag from a source selector to a target selector.
 *
 * @param {string} sourceSelector  CSS selector for the drag source.
 * @param {string} targetSelector  CSS selector for the drop target.
 * @param {object} [options]
 * @param {('topLeft'|'top'|'topRight'|'left'|'center'|'right'|'bottomLeft'|'bottom'|'bottomRight')} [options.sourcePosition='center']
 *   Where inside the source the drag starts. Cypress-style keyword.
 * @param {('topLeft'|'top'|'topRight'|'left'|'center'|'right'|'bottomLeft'|'bottom'|'bottomRight')} [options.targetPosition='center']
 *   Where inside the target the drop lands. Cypress-style keyword.
 * @param {number} [options.sourceX]  Precise X offset inside the source (overrides sourcePosition).
 * @param {number} [options.sourceY]  Precise Y offset inside the source (overrides sourcePosition).
 * @param {number} [options.targetX]  Precise X offset inside the target (overrides targetPosition).
 * @param {number} [options.targetY]  Precise Y offset inside the target (overrides targetPosition).
 */
Cypress.Commands.add(
  "realDragAndDrop",
  (sourceSelector, targetSelector, options = {}) => {
    cy.get(sourceSelector).then(($source) => {
      cy.get(targetSelector).then(($target) => {
        const s = $source[0].getBoundingClientRect();
        const t = $target[0].getBoundingClientRect();

        const [sOffX, sOffY] = resolveOffset(
          s,
          options.sourcePosition,
          options.sourceX,
          options.sourceY,
        );
        const [tOffX, tOffY] = resolveOffset(
          t,
          options.targetPosition,
          options.targetX,
          options.targetY,
        );

        cy.task(
          "cdpRealDrag",
          {
            fromX: Math.round(s.left + sOffX),
            fromY: Math.round(s.top + sOffY),
            toX:   Math.round(t.left + tOffX),
            toY:   Math.round(t.top + tOffY),
          },
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

/**
 * One-time settle hook. Call from a `before()` so the CDP client attaches +
 * arms `Input.setInterceptDrags` while Cypress's own CDP traffic is quiet —
 * before any `cy.visit` / `cy.intercept` / route stubbing kicks off the
 * automation/snapshot channels that would otherwise race the first real drag.
 *
 *   before(() => cy.realDragInit());
 *
 * Without this, the first drag of a spec run consistently loses its
 * intercept on busier setups (e.g. SPA-heavy apps loaded via cy.visit). The
 * plugin still falls back to an auto-retry path, but the explicit init is
 * the reliable signal.
 */
Cypress.Commands.add("realDragInit", () => {
  cy.task("cdpRealDragInit", null, { timeout: 30000 });
});
