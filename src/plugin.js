/**
 * cypress-real-dnd / plugin
 *
 * Node-side plugin. Registers two Cypress tasks:
 *   - `cdpRealDragInit` — call once in `before()` to settle Cypress's CDP
 *     listeners before any drag fires. Without this the very first drag of a
 *     spec run consistently loses its intercept.
 *   - `cdpRealDrag` — performs a full HTML5 drag from one set of viewport
 *     coords to another via real CDP events. Same primitive Puppeteer uses.
 *
 * Why this is hard (and why this plugin exists):
 *   Cypress's `cy.trigger("dragstart")` only dispatches a synthetic event —
 *   it does NOT enter the browser's HTML5 drag-and-drop pipeline, so
 *   react-dnd-html5-backend's monitor never wakes up. `cypress-real-events`
 *   fires real OS-level mouse events but the browser does not autonomously
 *   start an HTML5 drag from those either. The only path that gives you the
 *   real drag pipeline is CDP's `Input.setInterceptDrags` + capturing the
 *   `Input.dragIntercepted` event + replaying it at the target via
 *   `Input.dispatchDragEvent`. That's exactly what this plugin does.
 *
 * Limitations:
 *   - Chromium-family only (CDP). Electron and Chrome both work; Firefox
 *     and WebKit do not.
 *   - A drag can lose its intercept on the first call after browser launch or
 *     after an AUT navigation (cy.visit / app reload) — the renderer's
 *     intercept state is reset. We recover automatically: missed drags are
 *     retried (bounded) with a full pipeline re-warm between attempts, so no
 *     test-side retry wrapper is needed.
 *   - The `lsof`-based port discovery is POSIX-only; on Windows fall back to
 *     a TCP probe of common ranges (see `discoverDebuggerPort`).
 */

const CDP = require("chrome-remote-interface");

let debuggerPort = null;
let cdpPromise = null;
let lastDragData = null;

const DRAG_INTERCEPT_TIMEOUT_MS = 2000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Re-prime the HTML5 drag-intercept pipeline: a harmless off-canvas mouse
 * press/move/release cycle, then (re-)arm interceptDrags, then a settle.
 *
 * Empirically the renderer's intercept state is reset whenever the AUT
 * document reloads (cy.visit, app open, route change). The cached CDP client
 * survives those navigations (its socket stays open), so the once-per-spec
 * warmup no longer covers the new document and the first drag against it
 * silently loses its intercept ("No Input.dragIntercepted event"). Re-running
 * this cycle re-primes the pipeline for the current document.
 *
 * Best-effort and idempotent — safe to call any number of times. Used both for
 * the initial per-client warmup and to recover a cold-missed drag.
 */
async function warmupIntercept(Input) {
  try {
    await Input.dispatchMouseEvent({
      type: "mousePressed",
      x: 1,
      y: 1,
      button: "left",
      clickCount: 1,
    });
    await Input.dispatchMouseEvent({
      type: "mouseMoved",
      x: 20,
      y: 20,
      button: "left",
    });
    await sleep(100);
    await Input.dispatchMouseEvent({
      type: "mouseReleased",
      x: 20,
      y: 20,
      button: "left",
    });
    await sleep(200);
    await Input.setInterceptDrags({ enabled: true });
    // Long tail sleep so Cypress's automation/snapshot CDP traffic finishes
    // settling before the next real drag fires.
    await sleep(1500);
  } catch (_) {
    // Warmup is best-effort — the retry path still covers a missed drag.
  }
}

/**
 * Discover the browser's CDP port. Cypress's Electron picks a random
 * --remote-debugging-port and ignores launch-arg overrides. Strategy:
 *   1. Use `lsof -iTCP -sTCP:LISTEN -nP` to list every listening port owned
 *      by the cypress/electron/chrome processes.
 *   2. Validate each candidate by hitting CDP's `/json/version`.
 * On non-POSIX hosts (no `lsof`), fall back to sweeping the dynamic range.
 */
async function discoverDebuggerPort() {
  const http = require("http");
  const { execSync } = require("child_process");

  const validatePort = (port) =>
    new Promise((resolve) => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/json/version", timeout: 500 },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body).Browser ? port : null);
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
    });

  let candidatePorts = [];
  try {
    const raw = execSync(
      `lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null | grep -iE 'cypress|electron|chrome' | awk '{print $9}' | sed -E 's/.*:([0-9]+)$/\\1/'`,
      { encoding: "utf8" },
    );
    candidatePorts = Array.from(
      new Set(
        raw
          .split("\n")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 1024),
      ),
    );
  } catch (_) {
    candidatePorts = Array.from({ length: 16000 }, (_, i) => 49152 + i);
  }

  for (let i = 0; i < candidatePorts.length; i += 50) {
    const chunk = candidatePorts.slice(i, i + 50);
    const results = await Promise.all(chunk.map(validatePort));
    const hit = results.find((p) => p);
    if (hit) return hit;
  }
  return null;
}

async function getClient() {
  if (cdpPromise) {
    try {
      const cached = await cdpPromise;
      // Reuse the cached client ONLY while its CDP WebSocket is still OPEN
      // (ws.readyState === 1). After an AUT navigation (cy.visit / app reload)
      // Cypress recycles the CDP target and the socket goes to CLOSED (3);
      // reusing it makes Input.setInterceptDrags throw
      // "WebSocket is not open: readyState 3 (CLOSED)" — and realDragInit(),
      // which just awaits this same cached promise, cannot recover. Discard the
      // dead client here and rebuild a fresh one against the current target.
      if (cached && cached._ws && cached._ws.readyState === 1) return cached;
      try {
        await cached.close();
      } catch (_) {
        /* best-effort close of the dead client */
      }
    } catch (_) {
      /* cached promise itself rejected — fall through and rebuild */
    }
    cdpPromise = null;
  }
  if (!debuggerPort) {
    debuggerPort = await discoverDebuggerPort();
    if (!debuggerPort) {
      throw new Error(
        "[cypress-real-dnd] Could not discover the browser's CDP port. " +
          "On Windows / sandboxed envs, set REMOTE_DEBUGGING_PORT in launchOptions.",
      );
    }
  }
  cdpPromise = (async () => {
    await sleep(500);
    const targets = await CDP.List({ port: debuggerPort });
    // Cypress runs the AUT in an iframe inside the runner UI. The runner is
    // itself a CDP page target; mouse and drag events dispatched against it
    // route into the iframe based on viewport coords.
    const autTarget =
      targets.find(
        (t) =>
          t.type === "iframe" &&
          t.url.startsWith("http") &&
          !t.url.includes("/__/"),
      ) ||
      targets.find(
        (t) =>
          t.type === "page" &&
          (t.url.includes("__/#/specs/runner") || t.url.includes("__cypress")),
      );
    if (!autTarget) {
      throw new Error(
        `[cypress-real-dnd] No suitable CDP target. Saw: ${JSON.stringify(
          targets.map((t) => ({ type: t.type, url: t.url })),
        )}`,
      );
    }

    const client = await CDP({ port: debuggerPort, target: autTarget });
    const { Input } = client;
    Input.dragIntercepted(({ data }) => {
      lastDragData = data;
    });
    await Input.setInterceptDrags({ enabled: true });
    await sleep(300);

    // Prime the intercept pipeline once for this client. The very first real
    // drag after browser launch otherwise loses its intercept while Cypress's
    // own CDP listeners are still settling. (See warmupIntercept.)
    await warmupIntercept(Input);

    return client;
  })();
  return cdpPromise;
}

async function waitForDragData() {
  const deadline = Date.now() + DRAG_INTERCEPT_TIMEOUT_MS;
  while (!lastDragData && Date.now() < deadline) {
    await sleep(20);
  }
  if (!lastDragData) {
    throw new Error(
      "[cypress-real-dnd] No Input.dragIntercepted event after the " +
        "mouse-move past threshold. The source element may not be a real " +
        "HTML5 draggable (check `draggable=true` on the element or its " +
        "react-dnd connector target).",
    );
  }
  return lastDragData;
}

/**
 * Perform a full HTML5 drag from (fromX, fromY) to (toX, toY).
 * Coords are AUT-iframe-relative CSS pixels — the plugin translates them to
 * the runner page's viewport before dispatching.
 */
async function realDrag({ fromX, fromY, toX, toY }) {
  const client = await getClient();
  const { Input, Runtime } = client;

  // Re-arm interceptDrags on every call. Heavy Cypress operations between
  // drags — cy.visit, cy.intercept's automation hooks, snapshot capture —
  // can implicitly clear the renderer's intercept state. Idempotent enable
  // is cheap (~ms) and saves the auto-retry path from absorbing the cost.
  await Input.setInterceptDrags({ enabled: true });

  // Translate AUT-iframe-relative coords to runner-page viewport coords.
  // Cypress displays the AUT iframe scaled to fit between its UI panels;
  // we look up the iframe's displayed rect and the AUT's own innerWidth /
  // innerHeight, then scale + translate.
  let offX = 0;
  let offY = 0;
  let scaleX = 1;
  let scaleY = 1;
  try {
    const probe = await Runtime.evaluate({
      expression: `
        (() => {
          const f =
            document.querySelector('iframe.aut-iframe') ||
            document.querySelector('iframe[data-cy="aut-iframe"]') ||
            document.querySelector('iframe[src*="__/"]') ||
            document.querySelector('iframe');
          if (!f) return JSON.stringify({ ok: false });
          const r = f.getBoundingClientRect();
          return JSON.stringify({
            ok: true,
            left: r.left,
            top: r.top,
            w: r.width,
            h: r.height,
            innerW: f.contentWindow?.innerWidth || 0,
            innerH: f.contentWindow?.innerHeight || 0,
          });
        })()
      `,
      returnByValue: true,
    });
    const info = JSON.parse(probe.result?.value || "{}");
    if (info.ok) {
      offX = Math.round(info.left);
      offY = Math.round(info.top);
      if (info.innerW > 0 && info.w > 0) scaleX = info.w / info.innerW;
      if (info.innerH > 0 && info.h > 0) scaleY = info.h / info.innerH;
    }
  } catch (_) {
    // Probe failed — fall back to raw coords (assumes runner == AUT, e.g.
    // when the plugin is reused outside Cypress).
  }

  fromX = Math.round(offX + fromX * scaleX);
  fromY = Math.round(offY + fromY * scaleY);
  toX = Math.round(offX + toX * scaleX);
  toY = Math.round(offY + toY * scaleY);

  // Drag sequence. The first drag after browser launch OR after any AUT
  // navigation can lose its intercept (the renderer's intercept state was
  // reset and the once-per-client warmup no longer applies). Retry on a missed
  // intercept, re-priming the pipeline with a full warmup between attempts.
  const runOnce = async () => {
    lastDragData = null;
    await Input.dispatchMouseEvent({
      type: "mousePressed",
      x: fromX,
      y: fromY,
      button: "left",
      clickCount: 1,
    });
    await Input.dispatchMouseEvent({
      type: "mouseMoved",
      x: fromX + 10,
      y: fromY + 10,
      button: "left",
    });
    await sleep(30);
    await Input.dispatchMouseEvent({
      type: "mouseMoved",
      x: fromX + 25,
      y: fromY + 25,
      button: "left",
    });
    return waitForDragData();
  };

  // Safe to retry: a missed intercept means waitForDragData saw NO
  // dragIntercepted event — the HTML5 drag never started and nothing was
  // dropped, so re-attempting cannot double-drop. Bounded so a genuinely
  // non-draggable source still fails (with the original error) instead of
  // looping forever.
  const MAX_DRAG_ATTEMPTS = 4;
  let data;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_DRAG_ATTEMPTS; attempt++) {
    try {
      data = await runOnce();
      break;
    } catch (err) {
      lastErr = err;
      // Release any held button so the next attempt starts from a clean state.
      try {
        await Input.dispatchMouseEvent({
          type: "mouseReleased",
          x: fromX + 25,
          y: fromY + 25,
          button: "left",
        });
      } catch (_e) {}
      // Re-prime the intercept pipeline before retrying (skip after the last
      // attempt — nothing left to retry).
      if (attempt < MAX_DRAG_ATTEMPTS) await warmupIntercept(Input);
    }
  }
  if (!data) throw lastErr;

  await Input.dispatchDragEvent({ type: "dragEnter", x: toX, y: toY, data });
  await Input.dispatchDragEvent({ type: "dragOver", x: toX, y: toY, data });
  // A second dragOver helps drop zones that gate enablement on multiple
  // dragover ticks (some libraries debounce or require continuous hover).
  await Input.dispatchDragEvent({ type: "dragOver", x: toX, y: toY, data });
  await Input.dispatchDragEvent({ type: "drop", x: toX, y: toY, data });

  await Input.dispatchMouseEvent({
    type: "mouseReleased",
    x: toX,
    y: toY,
    button: "left",
  });

  return { ok: true };
}

/**
 * Initialize the CDP client + arm interceptDrags ahead of the first test.
 * Call from a `before()` hook so Cypress's own CDP listeners settle before
 * any drag fires.
 */
async function realDragInit() {
  await getClient();
  await sleep(1500);
  return { ok: true };
}

/**
 * Force a fresh re-prime of the intercept pipeline on the EXISTING client.
 * Unlike realDragInit (which is a no-op once the client is cached), this always
 * re-runs the warmup, so it recovers a stale intercept after an AUT navigation.
 * Use as an explicit escape hatch before a known-cold drag:
 *
 *   beforeEach(() => { cy.visit('/app'); cy.realDragRewarm(); });
 */
async function realDragRewarm() {
  const client = await getClient();
  await warmupIntercept(client.Input);
  return { ok: true };
}

/**
 * Register hooks + tasks with Cypress's setupNodeEvents.
 *
 *   const { realDragDropPlugin } = require('cypress-real-dnd/plugin');
 *   module.exports = defineConfig({
 *     e2e: {
 *       setupNodeEvents(on, config) {
 *         realDragDropPlugin(on);
 *       }
 *     }
 *   });
 */
function realDragDropPlugin(on) {
  on("before:browser:launch", (browser = {}, launchOptions) => {
    const args = launchOptions.args || [];
    const portArg = args.find(
      (a) => typeof a === "string" && a.startsWith("--remote-debugging-port="),
    );
    if (portArg) {
      debuggerPort = parseInt(portArg.split("=")[1], 10);
    } else {
      debuggerPort = null; // probed on first task call
    }
    return launchOptions;
  });

  on("task", {
    cdpRealDrag: realDrag,
    cdpRealDragInit: realDragInit,
    cdpRealDragRewarm: realDragRewarm,
  });
}

module.exports = { realDragDropPlugin };
