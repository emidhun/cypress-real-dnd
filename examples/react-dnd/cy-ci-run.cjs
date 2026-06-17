// CI runner: executes the Cypress suite via the module API so we can capture
// real result counts (the built-in json reporter only writes to stdout, not a
// file). Writes summary.json — consumed by the notify-slack job to build the
// Slack message — then exits non-zero if any test failed so the matrix cell
// still goes red.
//
// .cjs because the example package is ESM ("type": "module"); require() here
// resolves the matrix-pinned cypress in node_modules.
const fs = require("fs");
const cypress = require("cypress");

const cell = process.env.CELL || "cypress";

function write(summary) {
  fs.writeFileSync("summary.json", JSON.stringify(summary));
}

cypress
  .run({ browser: process.env.BROWSER })
  .then((results) => {
    // Cypress couldn't run at all (e.g. no spec, config error).
    if (results.status === "failed") {
      console.error(results.message);
      write({ cell, result: "failure", stats: null });
      process.exit(1);
    }
    write({
      cell,
      result: results.totalFailed > 0 ? "failure" : "success",
      stats: {
        tests: results.totalTests,
        passes: results.totalPassed,
        failures: results.totalFailed,
        pending: results.totalPending,
        skipped: results.totalSkipped,
        duration: results.totalDuration,
      },
    });
    process.exit(results.totalFailed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    write({ cell, result: "failure", stats: null });
    process.exit(1);
  });
