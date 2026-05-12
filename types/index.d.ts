declare namespace Cypress {
  interface RealDragAndDropOptions {
    /** X offset inside the source element (defaults to source center). */
    sourceX?: number;
    /** Y offset inside the source element (defaults to source center). */
    sourceY?: number;
    /** X offset inside the target element (defaults to target center). */
    targetX?: number;
    /** Y offset inside the target element (defaults to target center). */
    targetY?: number;
  }

  interface RealDragCoords {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }

  interface Chainable<Subject> {
    /**
     * Real HTML5 drag-and-drop from one selector to another, driven by Chrome
     * DevTools Protocol. Triggers the same drag pipeline a human user would,
     * so it works with `react-dnd`, `react-beautiful-dnd` (html5 backend),
     * `dnd-kit`'s html5 sensor, and plain HTML5 draggables.
     *
     * Pair with `cy.task('cdpRealDragInit')` in a `before()` hook so the
     * first drag of the spec lands on a settled CDP state.
     *
     * @example
     *   cy.realDragAndDrop('[data-cy=card-1]', '[data-cy=column-done]');
     */
    realDragAndDrop(
      sourceSelector: string,
      targetSelector: string,
      options?: RealDragAndDropOptions,
    ): Chainable<void>;

    /**
     * Lower-level: drag between explicit AUT-relative coords. Useful when the
     * drop target is a canvas-style surface without a single selectable
     * element.
     *
     * @example
     *   cy.realDrag({ fromX: 100, fromY: 200, toX: 600, toY: 400 });
     */
    realDrag(coords: RealDragCoords): Chainable<void>;
  }
}
