# cypress-real-dnd

Real HTML5 drag-and-drop for Cypress, driven by Chrome DevTools Protocol.

Companion to [`cypress-real-events`](https://github.com/dmtrKovalenko/cypress-real-events) — that one does mouse/keyboard, this does drag.

**Works with anything built on the browser's HTML5 drag-and-drop API:**
- [`react-dnd`](https://github.com/react-dnd/react-dnd) (html5 backend — the default)
- [Sortable.js](https://github.com/SortableJS/Sortable) (and `vue.draggable`, `react-sortablejs`, etc.)
- [`dnd-kit`](https://github.com/clauderic/dnd-kit) when configured with its html5 sensor
- Angular CDK `DragDropModule` (HTML5 events under the hood)
- Plain HTML5 `draggable="true"` elements
- File-drop zones (in-app DOM drops)

**Does NOT work with mouse/pointer-event drag libraries** (those don't fire `dragstart`):
- `react-beautiful-dnd` (default mode uses mousedown/mousemove)
- `dnd-kit` with its default `PointerSensor`
- Custom drag rolled with mousedown/mousemove/mouseup

For those, use [`cypress-real-events`](https://github.com/dmtrKovalenko/cypress-real-events)' `realMouseDown` / `realMouseMove` / `realMouseUp`. The two plugins are complementary — commands here follow the same `cy.real*` convention.

## Why?

Cypress's built-in `cy.trigger("dragstart")` is a **synthetic** `dispatchEvent` — it doesn't enter the browser's HTML5 drag-and-drop pipeline, so libraries that hook the real `dragstart` (like `react-dnd-html5-backend`) never wake up.

`cypress-real-events` fires real OS-level mouse events, but the browser does **not** autonomously start an HTML5 drag from mouse events alone.

The only path to a real drag in Cypress is what Puppeteer does: enable CDP drag interception, capture the `Input.dragIntercepted` event, then replay `dragEnter / dragOver / drop` at the target via `Input.dispatchDragEvent`. That's what this plugin does.

## Install

```bash
npm install --save-dev cypress-real-dnd
```

## Setup

**1. Register the plugin in `cypress.config.js`:**

```js
const { defineConfig } = require("cypress");
const { realDragDropPlugin } = require("cypress-real-dnd/plugin");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      realDragDropPlugin(on);
      return config;
    },
  },
});
```

**2. Install the commands in `cypress/support/e2e.js`:**

```js
import "cypress-real-dnd/commands";
```

**3. Settle CDP before any drag fires.** Add this to every spec that uses the helper:

```js
before(() => {
  cy.task("cdpRealDragInit");
});
```

> The first drag of a spec run consistently misses its CDP intercept — Cypress's own CDP listeners are still settling during that window. `cdpRealDragInit` burns that slot so your tests start from a stable state. **Without it, the first `it()` in the spec will fail.**

## Usage

```js
describe("Kanban board", () => {
  before(() => cy.task("cdpRealDragInit"));

  it("moves a card", () => {
    cy.realDragAndDrop("[data-cy=card-1]", "[data-cy=column-done]");
  });

  it("drops at a specific position inside the target", () => {
    cy.realDragAndDrop("[data-cy=card-2]", "[data-cy=canvas]", {
      targetX: 200,
      targetY: 400,
    });
  });

  it("low-level coord-based drag", () => {
    // For canvas-style drop targets without a single selectable element.
    cy.realDrag({ fromX: 100, fromY: 200, toX: 600, toY: 400 });
  });
});
```

## API

### `cy.realDragAndDrop(sourceSelector, targetSelector, options?)`

| Param | Type | Default | Notes |
|---|---|---|---|
| `sourceSelector` | `string` | — | CSS selector for the drag source |
| `targetSelector` | `string` | — | CSS selector for the drop target |
| `options.sourcePosition` | `RealDndPosition` | `'center'` | Keyword for where in the source to start. |
| `options.targetPosition` | `RealDndPosition` | `'center'` | Keyword for where in the target to drop. |
| `options.sourceX` | `number` | — | Precise X offset inside source (**overrides** `sourcePosition`). |
| `options.sourceY` | `number` | — | Precise Y offset inside source (**overrides** `sourcePosition`). |
| `options.targetX` | `number` | — | Precise X offset inside target (**overrides** `targetPosition`). |
| `options.targetY` | `number` | — | Precise Y offset inside target (**overrides** `targetPosition`). |

**Position keywords** (same set as `cypress-real-events`):
`topLeft`, `top`, `topRight`, `left`, `center`, `right`, `bottomLeft`, `bottom`, `bottomRight`.

```js
// Default: center → center
cy.realDragAndDrop('[data-cy=card]', '[data-cy=col]');

// Cypress-style position keywords
cy.realDragAndDrop('[data-cy=card]', '[data-cy=col]', {
  sourcePosition: 'center',
  targetPosition: 'topLeft',
});

// Precise pixel offsets (e.g. canvas grid)
cy.realDragAndDrop('[data-cy=card]', '[data-cy=canvas]', {
  targetX: 250,
  targetY: 400,
});

// Mix: keyword for source, precise pixels for target
cy.realDragAndDrop('[data-cy=card]', '[data-cy=canvas]', {
  sourcePosition: 'center',
  targetX: 250,
  targetY: 400,
});
```

### `cy.realDrag({ fromX, fromY, toX, toY })`

Drag between explicit AUT-relative coords.

### `cy.task("cdpRealDragInit")`

Initialize the CDP client and arm `Input.setInterceptDrags` ahead of the first test. Call once per spec from `before()`.

## How it works

1. **Port discovery.** Cypress's Electron picks a random `--remote-debugging-port` and ignores launch-arg overrides. The plugin uses `lsof` to find listening ports owned by cypress/electron/chrome processes, then validates each via CDP's `/json/version`.
2. **AUT iframe translation.** Cypress runs the app under test in an iframe inside the runner UI, scaled to fit. The plugin queries the iframe's bounding rect and the AUT's own `innerWidth/Height` to scale + translate AUT-relative coords into runner-page coords.
3. **Real drag via CDP.**
   - `Input.setInterceptDrags(true)` arms the renderer
   - `Input.dispatchMouseEvent` fires a real mousedown + moves past the drag threshold
   - Chromium initiates a real HTML5 drag and emits `Input.dragIntercepted` with `DragData`
   - The plugin replays `dragEnter → dragOver → dragOver → drop → mouseup` at the target via `Input.dispatchDragEvent`
4. **Auto-retry on first miss.** If the first attempt loses its intercept (Cypress's CDP listeners still settling), the plugin re-arms and retries once.

## Limitations

- **Chromium-family only.** Electron and Chrome work. Firefox and WebKit don't expose CDP and are not supported.
- **POSIX port discovery.** The `lsof` path is macOS/Linux. Windows currently falls back to a TCP sweep of the dynamic range — works but slower.
- **`cdpRealDragInit` in `before()` is required.** Without it the first drag of a spec fails (see Setup above).

## License

MIT
