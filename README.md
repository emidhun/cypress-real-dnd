# cypress-real-dnd

Real HTML5 drag-and-drop for Cypress, driven by Chrome DevTools Protocol.

## The problem this solves

HTML5 drag-and-drop has been broken in Cypress for years. Existing plugins claim to fix it; none of them actually do for the libraries people use.

| Existing approach | What it does | Why it doesn't work |
|---|---|---|
| Cypress's `cy.trigger("dragstart", ...)` | Synthetic `dispatchEvent` | Doesn't enter the browser's HTML5 drag pipeline. `react-dnd-html5-backend`'s monitor never fires. |
| [`cypress-drag-drop`](https://github.com/4teamwork/cypress-drag-drop) | Dispatches synthetic `new DragEvent(...)` | Same — synthetic events don't drive the HTML5 backend. Issues confirming this against react-dnd have been open for years. |
| [`cypress-real-events`](https://github.com/dmtrKovalenko/cypress-real-events) | Real OS-level mouse events via CDP | Real mouse events alone don't initiate an HTML5 drag in Chromium. The maintainer has confirmed drag is out of scope. |
| `react-dnd-test-backend` (swap backends in tests) | Test-only backend | Couples test infrastructure to product code. Doesn't generalize across libraries. |

This plugin uses the same primitive Puppeteer uses for real drag: CDP's `Input.setInterceptDrags` + `Input.dragIntercepted` event + `Input.dispatchDragEvent`. Chromium initiates a real HTML5 drag; we capture and replay it at the target. Same path a human user takes.

## Works with anything built on the browser's HTML5 drag API

- [`react-dnd`](https://github.com/react-dnd/react-dnd) with the html5 backend (the default)
- [Sortable.js](https://github.com/SortableJS/Sortable) and its wrappers (`vue.draggable`, `react-sortablejs`, …)
- [`dnd-kit`](https://github.com/clauderic/dnd-kit) when configured with an HTML5 sensor
- Angular CDK `DragDropModule` (HTML5 events under the hood)
- Plain HTML5 `draggable="true"` elements
- In-app file-drop zones

## Does NOT work with mouse/pointer-event drag libraries

These never fire `dragstart` — they listen to `mousedown` + `mousemove` directly:

- `react-beautiful-dnd` (default mouse mode)
- `dnd-kit` with the default `PointerSensor` / `MouseSensor`
- Custom drag rolled with `mousedown` / `mousemove` / `mouseup`

For those, use `cypress-real-events`' `realMouseDown` / `realMouseMove` / `realMouseUp`. The two libraries solve different problems — neither is a superset of the other.

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

**Position keywords:**
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
