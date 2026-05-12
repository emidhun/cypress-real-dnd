# examples/react-dnd

Standalone self-test for `cypress-real-dnd` against a react-dnd HTML5-backend app. Also serves as a runnable demo.

The app is a stripped-down kanban-/builder-style UI: sidebar with three draggable widget cards, a canvas drop zone that records what landed where.

## Run it locally

```bash
# from the repo root
cd examples/react-dnd
npm install
npm run dev               # starts the vite app on http://localhost:5173

# in another terminal
npm run cy:run            # headless run, exits non-zero on failure
# or
npm run cy:open           # interactive
```

The Cypress spec covers every option path of `cy.realDragAndDrop`:

- default (center → center)
- `targetPosition: 'topLeft'`
- `targetPosition: 'bottomRight'`
- `targetX/Y` pixel offsets
- mixed `sourcePosition` keyword + `targetX/Y` pixels
- multiple drops accumulating
- low-level `cy.realDrag({ fromX, fromY, toX, toY })`
- invalid position keyword (asserts the error message)

Plus the `cdpRealDragInit` task in `before()`.

## How the plugin is wired

`package.json` references the parent package via `file:../..`:

```json
"cypress-real-dnd": "file:../.."
```

So local changes to `src/plugin.js` / `src/commands.js` flow into the example without a re-publish. CI uses the same setup.

## Used in CI

The repo's GitHub Actions workflow runs this example on every push to verify the plugin still works against the public API. See `.github/workflows/test.yml`.
