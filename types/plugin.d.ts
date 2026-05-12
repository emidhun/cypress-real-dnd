/**
 * Register the plugin's `before:browser:launch` hook and Cypress tasks
 * (`cdpRealDrag`, `cdpRealDragInit`).
 *
 * @example
 *   const { realDragDropPlugin } = require('cypress-real-drag-drop/plugin');
 *   module.exports = defineConfig({
 *     e2e: {
 *       setupNodeEvents(on) { realDragDropPlugin(on); }
 *     }
 *   });
 */
export function realDragDropPlugin(
  on: (event: string, handler: any) => void,
): void;
