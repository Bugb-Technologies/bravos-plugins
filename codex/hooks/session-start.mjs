// @comment -- "SessionStart hook entry (--global: the user-level copy, silent where the repo has its own bravos hook or no .guardlink/; --briefing prints only the briefing text, for a skill that runs it by hand): reads the hook payload from stdin (bounded wait, bad input ignored; source, and Antigravity's workspacePaths), awaits collect() (read-only guardlink, git and gh facts under a shared 20 s deadline), and prints one JSON envelope: the briefing as additionalContext for the model, plus on a fresh start a banner as systemMessage for the human (brand-coloured; a three-line summary for Codex). With --harness agy it prints Antigravity's injectSteps instead. Always exits 0 so a session never fails to start."
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBanner, buildBriefing, buildSummary, collect, readVersion } from './lib/briefing.mjs';

const STDIN_WAIT_MS = 1000;

/** The hook payload as an object ({} for no, empty or bad input). */
async function readPayload() {
  if (process.stdin.isTTY) return {};
  const read = (async () => {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
  })().catch(() => '');
  const raw = await Promise.race([read, new Promise((r) => setTimeout(() => r(''), STDIN_WAIT_MS).unref())]);
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function harnessArg(argv, env) {
  const i = argv.indexOf('--harness');
  const v = i === -1 ? null : argv[i + 1];
  if (v === 'claude' || v === 'codex' || v === 'omp' || v === 'agy') return v;
  return env.CLAUDE_PROJECT_DIR ? 'claude' : 'other';
}

async function main() {
  const env = process.env;
  const harness = harnessArg(process.argv, env);
  if (process.argv.includes('--briefing')) {
    // Plain text for an agent whose harness ran no hook: no JSON to parse, no banner to read past.
    let t;
    try {
      t = buildBriefing(await collect(env.CLAUDE_PROJECT_DIR || process.cwd(), env));
    } catch (e) {
      t = `bravos briefing failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    process.stdout.write(t + '\n');
    process.exit(0);
  }
  const out = {};
  let text;
  try {
    const payload = await readPayload();
    const source = typeof payload.source === 'string' ? payload.source : null;
    // Antigravity sends the workspace in the payload; Claude Code sets CLAUDE_PROJECT_DIR; others run in the repo.
    const ws = Array.isArray(payload.workspacePaths) && typeof payload.workspacePaths[0] === 'string' ? payload.workspacePaths[0] : null;
    const root = env.CLAUDE_PROJECT_DIR || ws || (typeof payload.cwd === 'string' ? payload.cwd : null) || process.cwd();
    // User-level hook (bravos init --global): a repo's own bravos hook wins, and a repo with no
    // threat model gets nothing, so the user hook never doubles the briefing or adds noise.
    if (process.argv.includes('--global') && (existsSync(join(root, '.bravos', 'hooks', 'session-start.mjs')) || !existsSync(join(root, '.guardlink')))) {
      process.exit(0);
    }
    const inputs = await collect(root, env);
    text = buildBriefing(inputs);
    if (env.BRAVOS_BANNER !== 'off' && (source === null || source === 'startup') && harness !== 'agy') {
      const version = readVersion(dirname(fileURLToPath(import.meta.url)));
      const color = !env.NO_COLOR && env.BRAVOS_BANNER_COLOR !== 'off';
      // Codex lists a hook's message as a warning, so it gets a three-line summary, not the art.
      // The leading newline puts the logo on its own lines: Claude Code prefixes the first line with "SessionStart:startup says:".
      out.systemMessage = harness === 'codex' ? buildSummary(inputs, { harness, version }) : '\n' + buildBanner(inputs, { harness, version, color });
    }
  } catch (e) {
    text = `bravos briefing failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (harness === 'agy') {
    // Antigravity's SessionStart output: steps injected before the first model call.
    process.stdout.write(JSON.stringify({ injectSteps: [{ systemMessage: text, metadata: { source: 'bravos' } }] }) + '\n');
    process.exit(0);
  }
  out.hookSpecificOutput = { hookEventName: 'SessionStart', additionalContext: text };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

main();
