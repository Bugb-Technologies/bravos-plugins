// @comment -- "bravos autopilot Stop hook entry (Claude Code and Codex): reads the Stop payload from stdin with a bounded wait, resolves the repo as git's top level for the payload cwd, runs the end-of-turn check, and prints {} to allow or {decision:'block', reason} to send the agent back once, logging the nudge for bravos watch. Always exits 0; a failure allows."
import { entitled, status as licenceStatus } from './lib/licence.mjs';
import { resolveRoot } from './lib/pre-pr.mjs';
import { logWatchEvent, runAutopilot } from './lib/autopilot.mjs';

async function readPayload() {
  if (process.stdin.isTTY) return {};
  const read = (async () => {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
  })().catch(() => '');
  const raw = await Promise.race([read, new Promise((r) => setTimeout(() => r(''), 1000).unref())]);
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

async function main() {
  let out = {};
  // Autopilot is part of the pre-PR gate feature; without the licence the Stop hook answers nothing and the turn ends normally.
  if (!entitled(licenceStatus(process.env), 'pre-pr')) {
    process.stdout.write('{}\n');
    process.exit(0);
  }
  try {
    const payload = await readPayload();
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const root = resolveRoot(cwd, process.env);
    const r = await runAutopilot({ root, env: process.env, payload });
    if (r.decision === 'block') {
      out = { decision: 'block', reason: r.reason };
      logWatchEvent(root, r);
    }
  } catch {
    out = {};
  }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

main();
