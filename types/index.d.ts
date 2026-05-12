declare namespace Cypress {
  /**
   * Position keyword inside an element, mirroring `cypress-real-events`'
   * `position` option.
   */
  type RealDndPosition =
    | "topLeft"
    | "top"
    | "topRight"
    | "left"
    | "center"
    | "right"
    | "bottomLeft"
    | "bottom"
    | "bottomRight";

  interface RealDragAndDropOptions {
    /**
     * Where inside the source element the drag starts.
     * Defaults to `'center'`. Overridden by `sourceX`/`sourceY` if provided.
     */
    sourcePosition?: RealDndPosition;
    /**
     * Where inside the target element the drop lands.
     * Defaults to `'center'`. Overridden by `targetX`/`targetY` if provided.
     */
    targetPosition?: RealDndPosition;
    /** Precise X offset inside the source (overrides `sourcePosition`). */
    sourceX?: number;
    /** Precise Y offset inside the source (overrides `sourcePosition`). */
    sourceY?: number;
    /** Precise X offset inside the target (overrides `targetPosition`). */
    targetX?: number;
    /** Precise Y offset inside the target (overrides `targetPosition`). */
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
     * so it works with `react-dnd`, `dnd-kit`'s html5 sensor, Sortable.js,
     * and any plain HTML5 `draggable="true"` element.
     *
     * Pair with `cy.task('cdpRealDragInit')` in a `before()` hook so the
     * first drag of the spec lands on a settled CDP state.
     *
     * @example
     *   // Center → center (default)
     *   cy.realDragAndDrop('[data-cy=card]', '[data-cy=column]');
     *
     *   // Cypress-style position keywords
     *   cy.realDragAndDrop('[data-cy=card]', '[data-cy=column]', {
     *     sourcePosition: 'center',
     *     targetPosition: 'topLeft',
     *   });
     *
     *   // Precise pixel offset inside the target (e.g. canvas grid)
     *   cy.realDragAndDrop('[data-cy=card]', '[data-cy=canvas]', {
     *     targetX: 250,
     *     targetY: 400,
     *   });
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
