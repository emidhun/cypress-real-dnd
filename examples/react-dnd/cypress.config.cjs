const { defineConfig } = require("cypress");
const { realDragDropPlugin } = require("cypress-real-dnd/plugin");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    viewportWidth: 1280,
    viewportHeight: 800,
    setupNodeEvents(on, config) {
      realDragDropPlugin(on);
      return config;
    },
    video: false,
    screenshotOnRunFailure: true,
    experimentalMemoryManagement: true,
  },
});
