// Builds the Slack chat.postMessage payload for the notify-slack job.
//
// Reads every summaries/<artifact>/summary.json produced by the matrix cells,
// renders a per-cell pass/fail/duration breakdown plus totals, and writes the
// complete Block Kit payload to payload.json (consumed via the action's
// payload-file-path input). Driven entirely by env vars set in the workflow.

const fs = require("fs");
const path = require("path");

const env = process.env;
const SUMMARY_DIR = "summaries";

// Collect each cell's summary.json (one per artifact subdirectory). Missing or
// malformed files are skipped — the overall headline still reflects reality
// via the OVERALL job result.
function loadCells() {
  const cells = [];
  let entries = [];
  try {
    entries = fs.readdirSync(SUMMARY_DIR);
  } catch {
    return cells;
  }
  for (const entry of entries) {
    const file = path.join(SUMMARY_DIR, entry, "summary.json");
    try {
      cells.push(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch {
      // no readable summary for this cell — ignore
    }
  }
  // Stable, readable order regardless of artifact download order.
  return cells.sort((a, b) => String(a.cell).localeCompare(String(b.cell)));
}

function fmtDuration(ms) {
  if (!ms && ms !== 0) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

const cells = loadCells();

const totals = { tests: 0, passes: 0, failures: 0, pending: 0, duration: 0 };
const lines = cells.map((c) => {
  const s = c.stats;
  if (!s) {
    return `:warning: *${c.cell}* — no results (run crashed before reporting)`;
  }
  totals.tests += s.tests || 0;
  totals.passes += s.passes || 0;
  totals.failures += s.failures || 0;
  totals.pending += s.pending || 0;
  totals.duration += s.duration || 0;
  const icon = (s.failures || 0) > 0 ? ":x:" : ":white_check_mark:";
  const parts = [`${s.passes || 0} passed`];
  if (s.failures) parts.push(`${s.failures} failed`);
  if (s.pending) parts.push(`${s.pending} pending`);
  parts.push(fmtDuration(s.duration));
  return `${icon} *${c.cell}* — ${parts.join(" · ")}`;
});

const passed = env.OVERALL === "success";
// Coloured bar down the left of the attachment — instant green/red signal.
const color = passed ? "#2eb67d" : "#e01e5a";
const headline = `${passed ? "✅" : "❌"} Cypress ${passed ? "passed" : "failed"} on ${env.BRANCH}`;
const breakdown = lines.length ? lines.join("\n") : "_No cell summaries found._";

const totalsLine =
  `*${totals.passes}/${totals.tests}* passed` +
  (totals.failures ? ` · *${totals.failures}* failed` : "") +
  (totals.pending ? ` · ${totals.pending} pending` : "") +
  ` · ⏱ ${fmtDuration(totals.duration)}`;

const commitUrl = `${env.SERVER_URL}/${env.REPO}/commit/${env.SHA}`;
const runUrl = `${env.SERVER_URL}/${env.REPO}/actions/runs/${env.RUN_ID}`;
const shortSha = String(env.SHA || "").slice(0, 7);

// Everything lives inside one coloured attachment so the bar spans the
// whole message. The header block gives a big, scannable status line.
const payload = {
  channel: env.CHANNEL,
  text: `Cypress ${passed ? "passed" : "failed"} on ${env.BRANCH} — ${totals.passes}/${totals.tests} passed`,
  attachments: [
    {
      color,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", emoji: true, text: headline },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `\`${env.REPO}\`\n${totalsLine}` },
        },
        { type: "divider" },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Results by browser*\n${breakdown}` },
        },
        { type: "divider" },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Branch*\n${env.BRANCH}` },
            { type: "mrkdwn", text: `*Triggered by*\n${env.ACTOR}` },
            { type: "mrkdwn", text: `*Event*\n${env.EVENT}` },
            { type: "mrkdwn", text: `*Commit*\n<${commitUrl}|${shortSha}>` },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", emoji: true, text: "🔍 View run" },
              url: runUrl,
              style: passed ? "primary" : "danger",
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `${env.REPO} • run <${runUrl}|#${env.RUN_ID}>`,
            },
          ],
        },
      ],
    },
  ],
};

fs.writeFileSync("payload.json", JSON.stringify(payload, null, 2));
console.log(fs.readFileSync("payload.json", "utf8"));
