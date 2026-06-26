declare namespace Cypress {
  /**
   * Position keyword inside an element. Standard Cypress 9-keyword set.
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
     * DevTools Protocol. Triggers the actual `dragstart` → `dragover` → `drop`
     * pipeline a human user does — so it works with `react-dnd`, Sortable.js,
     * `dnd-kit`'s html5 sensor, and any plain HTML5 `draggable="true"`
     * element, where synthetic-event plugins do not.
     *
     * Pair with `cy.realDragInit()` in a `before()` hook so the first drag
     * of the spec lands on a settled CDP state.
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

    /**
     * One-time CDP settle hook. Call from a `before()` block so the plugin
     * attaches its CDP client and arms `Input.setInterceptDrags` while
     * Cypress's own CDP traffic is quiet — before any `cy.visit` /
     * `cy.intercept` / route stubbing kicks off the automation channels
     * that would otherwise race the first real drag.
     *
     * Without this, the first drag of a spec run consistently loses its
     * intercept on busier setups. The plugin still has an auto-retry path,
     * but the explicit init is the reliable signal.
     *
     * @example
     *   before(() => cy.realDragInit());
     */
    realDragInit(): Chainable<void>;

    /**
     * Force a fresh re-prime of the drag pipeline on demand. Unlike
     * `realDragInit` (a no-op once warmed), this always re-runs the warmup, so
     * it recovers a stale intercept after the AUT navigates. Use before a
     * known-cold drag to fix a flaky "No Input.dragIntercepted" failure.
     *
     * @example
     *   beforeEach(() => { cy.visit('/app'); cy.realDragRewarm(); });
     */
    realDragRewarm(): Chainable<void>;
  }
}
