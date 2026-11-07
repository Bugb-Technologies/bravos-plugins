// @comment -- "Pure text builder for the session-start briefing, collect() which gathers its read-only guardlink, git and gh facts concurrently under a shared deadline (and renews a signed-in machine's device licence when it is due, through refresh.mjs — the one write it makes, to $BRAVOS_HOME only), and the runJson/runJsonAsync spawn wrappers; dependency-free so it can be copied verbatim into target repos."
import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import { basename, delimiter, dirname, join } from 'node:path';
import { readProving } from './proving.mjs';
import { planLine, status as licenceStatus } from './licence.mjs';
import { refreshIfDue } from './refresh.mjs';
import { readSast, sastAvailable, sastLine } from './sast.mjs';
import { readSetup, setupLine } from './setup.mjs';
import { memberCounts, readWorkspace, workspaceLines } from './workspace.mjs';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const MAX_LINES = 40;
const MAX_DEGRADED = 3;

const NEXT_CLAUDE = 'Next: /bravos for the next step · /bravos-annotate to extend coverage · /bravos-ship before a PR';
const NEXT_OTHER =
  'Next: run the bravos skill for the next step · bravos-annotate to extend coverage · bravos-ship before a PR';

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const sevRank = (s) => {
  const i = SEVERITIES.indexOf(s);
  return i === -1 ? SEVERITIES.length : i;
};

/** Asset and threat for a CiClaim: its own fields when present, else the first two #ids in its claim text. */
function assetThreat(c) {
  const ids = typeof c?.claim === 'string' ? (c.claim.match(/#[\w-]+/g) ?? []) : [];
  return { asset: c?.asset ?? ids[0] ?? '?', threat: c?.threat ?? ids[1] ?? '?' };
}

function claimLine(c) {
  const { asset, threat } = assetThreat(c);
  // Real ci confirmed[] entries carry location.{file,line}; CiClaim-shaped entries carry file/line at top level.
  const file = c?.location?.file ?? c?.file;
  const line = c?.location?.line ?? c?.line;
  return `${c?.severity ?? 'unknown'} ${asset} / ${threat} — ${file}:${line}`;
}

/** Always returns a line: an unreadable ci prints "unknown", never zeros. */
function exposuresLine(g) {
  const ci = g.ci;
  let line;
  if (!ci) {
    line = 'Open exposures: unknown (guardlink ci unavailable)';
  } else {
    const s = ci.summary ?? {};
    const list = arr(ci.exposures);
    const by = s.by_severity ?? Object.fromEntries(SEVERITIES.map((k) => [k, list.filter((e) => e?.severity === k).length]));
    const total = typeof s.exposures === 'number' ? s.exposures : list.length;
    line = `Open exposures: ${total} (${SEVERITIES.map((k) => `${k} ${num(by[k])}`).join(', ')})`;
    if (s.coverage) {
      const c = s.coverage;
      line += ` · coverage ${num(c.percent)}% (${num(c.annotated_files)}/${num(c.source_files)} files)`;
    }
  }
  // The worklist is unannotated source files: from `guardlink unannotated` when given, else from ci coverage.
  const w = g.unannotated;
  const cov = ci?.summary?.coverage;
  let n = null;
  if (w) n = typeof w.summary?.worklist === 'number' ? w.summary.worklist : arr(w.worklist).length;
  else if (cov) n = Math.max(0, num(cov.source_files) - num(cov.annotated_files));
  if (n !== null) line += ` · worklist ${n} files`;
  return line;
}

// @comment -- "Reads .guardlink/intent.md (written by bravos-context) and reports whether the product's intent is recorded: none, draft (any item marked '— draft') or confirmed, with the invariant count; read-only."
export function readIntent(root) {
  let text;
  try {
    text = readFileSync(join(root, '.guardlink', 'intent.md'), 'utf8');
  } catch {
    return { status: 'none', invariants: 0, drafts: 0 };
  }
  const items = text.split('\n').filter((l) => /^\s*[-*]\s/.test(l));
  const invariants = items.filter((l) => /\bINV-\d+\b/.test(l)).length;
  const drafts = items.filter((l) => /—\s*draft\s*$/i.test(l)).length;
  return { status: drafts > 0 ? 'draft' : 'confirmed', invariants, drafts };
}

function intentLine(intent, harness) {
  const run = harness === 'claude' ? '/bravos-context' : 'the bravos-context skill';
  if (intent.status === 'none') return `Intent: none — severities are not calibrated to the product; run ${run}`;
  if (intent.status === 'draft') return `Intent: draft (${intent.invariants} invariants, ${intent.drafts} items unconfirmed) — confirm with ${run}`;
  return `Intent: confirmed (${intent.invariants} invariants)`;
}


const SKILL_SIGIL = { claude: '/', codex: '$', omp: '/skill:', opencode: '/' };

// @comment -- "The coaching block the briefing gives the agent in every harness: the Setup line (score and next unlock with its command) and, unless BRAVOS_COACH=off, a few rules for guiding a person who is not a power user — offer once, suggest at natural moments, plain words first, never lecture; shrinks to one rule once most of setup is on."
function coachLines(i) {
  if (!i.root || i.guardlink === 'missing') return [];
  const s = readSetup(i.root, i, i.harness);
  const out = [setupLine(s)];
  if (i.env?.BRAVOS_COACH === 'off' || process.env.BRAVOS_COACH === 'off') return out;
  const k = (n) => (SKILL_SIGIL[i.harness] ? `${SKILL_SIGIL[i.harness]}${n}` : n);
  if (s.done > 7) {
    out.push(`How to help: at natural moments suggest the next bravos step in one plain line (annotate after security edits, ${k('bravos-ship')} before a PR, ${k('bravos-recheck')} after a fix); never nag.`);
    return out;
  }
  out.push(
    'How to help this person (offer, never lecture; one offer per topic per session):',
    `- In your first reply, if setup is under 5 or intent is none, offer once in plain words three starts that fit this repo, in setup order (build the code graph first if it is off, then learn what the app intends, annotate the uncovered files, run SAST, prove the top threats; or check this branch before a PR) and \`bravos guide\` for more; then follow their lead.`,
    `- After you edit security-relevant code, offer to record what it exposes (${k('bravos-annotate')}); before a PR, run the ship check (${k('bravos-ship')}); after a fix, offer a recheck (${k('bravos-recheck')}).`,
    '- When a request would go better with the next unlock above, say what it would add, once. Plain words first, skill name second. Never send test traffic without the authorization bravos-env asks for.',
    '- Once, when it helps them follow along, mention that `bravos watch` in a second terminal pane shows this live as you work (free, read-only).',
  );
  return out;
}

/** Builds the briefing text. Never throws on partial inputs. */
export function buildBriefing(inputs) {
  const i = inputs ?? {};
  const lines = [`GuardLink security picture (bravos) — ${i.repo} @ ${i.sha}, base ${i.base}`];
  for (const e of arr(i.errors).slice(0, MAX_DEGRADED)) lines.push(`  (degraded: ${e})`);
  const nextLine = i.harness === 'claude' ? NEXT_CLAUDE : NEXT_OTHER;

  if (i.guardlink === 'missing') {
    lines.push('guardlink: not found on PATH — run bravos doctor', nextLine);
    return lines.join('\n');
  }

  const g = i.guardlink ?? {};
  const head = [];
  head.push(exposuresLine(g));

  // Truncatable sections: { header, items }; the cap drops tickets first, then stale, FIX NOW, next.
  const confirmed = arr(g.ci?.confirmed).slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const fix = { header: `FIX NOW — confirmed exploitable (${confirmed.length}):`, items: confirmed.slice(0, 5).map((c) => `  - ${claimLine(c)}`) };
  if (confirmed.length > 5) fix.items.push(`  … and ${confirmed.length - 5} more`);
  if (confirmed.length === 0) fix.items = [];

  const queue = arr(g.next?.queue).slice(0, 3);
  const next = {
    header: 'Next to test or fix (guardlink hypothesis next):',
    items: queue.map((q, n) => `  ${n + 1}. [${q.state}] ${claimLine(q)}`),
  };

  const changed = new Set(arr(i.changedFiles));
  const stale = arr(g.ci?.stale).filter((c) => changed.has(c.file));
  const staleSec = {
    header: `Went stale in files you changed since ${i.base} (${stale.length}):`,
    items: stale.slice(0, 5).map((c) => `  - ${c.file}:${c.line} ${c.verb}`),
  };

  const results = arr(g.tickets?.results);
  const ticketCount = typeof g.tickets?.count === 'number' ? g.tickets.count : results.length;
  const tickets = {
    header: `Open tickets (${ticketCount}):`,
    items: results.slice(0, 5).map((t) => `  - ${t.ref} ${t.threat} on ${t.asset} by ${t.assignee ?? 'unassigned'} until ${t.due ?? 'n/a'}`),
  };

  const tail = [];
  if (!i.inFlight) tail.push('In flight by teammates: unknown (gh unavailable)');
  else if (i.inFlight.prs > 0 || i.inFlight.files > 0) {
    tail.push(`In flight by teammates: ${i.inFlight.files} files in ${i.inFlight.prs} open PRs`);
  }
  if (i.intent && typeof i.intent === 'object') tail.push(intentLine(i.intent, i.harness));
  if (i.proving && typeof i.proving === 'object') {
    const p = i.proving;
    tail.push(p.status === 'set'
      ? `Proving: ${p.choice}${p.target ? ` on ${p.target}` : ''}${p.generation ? ', model-API probes allowed' : ''} (${p.by}, ${p.date}, .guardlink/proving.md)`
      : 'Proving: not set — when proving comes up, ask the person once how they want it handled and record it (bravos-prove)');
  }
  if (i.shadow) {
    tail.push(i.shadow.userNewer
      ? `Note: this repo's bravos (${i.shadow.repo}) is behind the person's user-level copy (${i.shadow.user}), which Claude Code uses; suggest they run bravos sync in this repo from their own terminal`
      : `Note: the person's user-level bravos skills (~/.claude/skills, ${i.shadow.user}) are used instead of this repo's (${i.shadow.repo}); tell them to run bravos sync --global from their own terminal, then start a new session`);
  }
  if (i.autopilot) tail.push('Autopilot: on — an end-of-turn check sends you back once if changed code lacks annotations, sits under a confirmed or stale claim, or adds exposures to prove');
  if (i.codegraph === 'current') tail.push('Code graph: current');
  else if (i.codegraph === 'cli') tail.push('Code graph: ask it with `bravos graph <question> --json` (same answers as the codegraph_ tools; e.g. attack-surface, entry-points, callers, reachable-sinks, call-chain); if it says no graph, build it: bravos graph build . (bravos-codegraph)');
  else if (i.codegraph === 'not-built') tail.push('Code graph: none for this commit — bravos keys a graph to the commit it was built at, so a new commit needs a rebuild: bravos graph build . --scip no-exec (bravos-codegraph; no tokens, a few minutes). Until then skills trace routes by reading.');
  else if (i.codegraph === 'diverged') tail.push('Code graph: diverged — rebuild with codegraph-build --scip no-exec');
  else if (i.codegraph === 'locked') tail.push('Code graph: on the Team plan (see Plan above) — skills trace routes by reading until then');
  else if (i.codegraph === 'unavailable') tail.push('Code graph: unavailable — skills trace routes by reading; when the person asks, set it up yourself (bravos-codegraph step 1: bravos setup with their go-ahead, then bravos graph build .)');
  if (i.sast && typeof i.sast === 'object') tail.push(sastLine(i.sast.summary, i.sast.available));
  if (i.workspace) tail.push(...workspaceLines(i.workspace, i.workspaceCounts));

  const sections = [fix, next, staleSec, tickets].filter((s) => s.items.length > 0);
  const count = () => lines.length + head.length + sections.reduce((n, s) => n + 1 + s.items.length, 0) + tail.length + 1;
  for (const s of [tickets, staleSec, fix, next]) {
    while (count() > MAX_LINES && s.items.length > 0) s.items.pop();
  }

  for (const l of head) lines.push(l);
  for (const s of sections) {
    if (s.items.length === 0) continue;
    lines.push(s.header, ...s.items);
  }
  lines.push(...tail, ...coachLines(i), nextLine);
  return lines.join('\n');
}

/** Runs `cmd args` read-only with a timeout and parses stdout as JSON. */
export function runJson(cmd, args, { cwd, timeoutMs = 10000, env = process.env } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.error) {
    if (r.error.code === 'ETIMEDOUT') return { ok: false, error: `${cmd}: timed out after ${timeoutMs / 1000}s` };
    return { ok: false, error: `${cmd}: ${r.error.code ?? r.error.message}` };
  }
  const ticketsNoMatch = cmd === 'guardlink' && args.includes('lookup') && args.includes('tickets') && r.status === 2;
  if (r.status !== 0 && !ticketsNoMatch) return { ok: false, error: `${cmd} exited ${r.status}` };
  try {
    return { ok: true, json: JSON.parse(r.stdout) };
  } catch {
    return { ok: false, error: `${cmd}: output was not JSON` };
  }
}

const MAX_OUTPUT = 64 * 1024 * 1024;

/**
 * Spawns `cmd args` (no shell, stdin and stderr ignored) and resolves with its stdout, capped at 64 MiB by
 * discarding the excess. A timer kills the child at `timeoutMs` and resolves at once, without waiting for
 * grandchildren that may still hold the pipe open.
 */
// @comment -- "Async read-only spawn core for collect(): argv array, bounded output, per-command kill timer; never rejects."
function capture(cmd, args, { cwd, timeoutMs = 10000, env = process.env } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    let child;
    try {
      child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      resolve({ error: e?.code ?? e?.message ?? String(e) });
      return;
    }
    const chunks = [];
    let size = 0;
    child.stdout.on('data', (b) => {
      if (size >= MAX_OUTPUT) return;
      const keep = b.length > MAX_OUTPUT - size ? b.subarray(0, MAX_OUTPUT - size) : b;
      chunks.push(keep);
      size += keep.length;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      child.stdout.destroy();
      finish({ timedOut: true });
    }, Math.max(0, timeoutMs));
    child.on('error', (e) => finish({ error: e.code ?? e.message }));
    child.on('close', (status) => finish({ status, stdout: Buffer.concat(chunks).toString('utf8') }));
  });
}

/** Async runJson: same argv, cap and `{ok, json} | {ok, error}` shapes and error strings, without blocking the event loop. */
// @comment -- "Async read-only runJson for collect(): spawns through capture() (argv array, no shell, per-command timeout), maps timeout, spawn error and non-zero exit to an error string, and parses stdout as JSON; never rejects."
export async function runJsonAsync(cmd, args, { cwd, timeoutMs = 10000, env = process.env } = {}) {
  const r = await capture(cmd, args, { cwd, timeoutMs, env });
  if (r.timedOut) return { ok: false, error: `${cmd}: timed out after ${timeoutMs / 1000}s` };
  if (r.error) return { ok: false, error: `${cmd}: ${r.error}` };
  const ticketsNoMatch = cmd === 'guardlink' && args.includes('lookup') && args.includes('tickets') && r.status === 2;
  if (r.status !== 0 && !ticketsNoMatch) return { ok: false, error: `${cmd} exited ${r.status}` };
  try {
    return { ok: true, json: JSON.parse(r.stdout) };
  } catch {
    return { ok: false, error: `${cmd}: output was not JSON` };
  }
}

function whichOnPath(name, env) {
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    try {
      accessSync(join(dir, name), constants.X_OK);
      return true;
    } catch {
      /* keep looking */
    }
  }
  return false;
}

/**
 * Gathers the briefing inputs for `root`. The guardlink commands, gh and the git chain run concurrently;
 * each command gets 10 s or what is left of the shared `deadlineMs` (20 s), whichever is less, so the
 * whole collect stays inside the 30 s the hook registers and a slow command degrades only its own line.
 */
// @comment -- "Runs read-only guardlink ci / hypothesis next / lookup tickets, git and gh pr list concurrently under a shared deadline and returns BriefingInputs; the worklist count comes from ci coverage, so guardlink unannotated is not run."
// @comment -- "Whether bravos has a code graph for this commit, without loading it: bravos answers codegraph_unavailable in well under a second when it has none, and spends seconds loading one that exists, so a probe still running at timeoutMs means a graph is there (it is killed). Returns not-built, current (it answered), cli (present, still loading), or null when bravos is not on PATH. BRAVOS_GRAPH_PROBE=off skips it and reads as cli. Read-only: argv, no shell."
export async function probeGraph(root, env, timeoutMs = 3000) {
  // Either bravos answers `graph acceptance-register --json`: this CLI (through codegraph-mcp) or the Python one.
  if (!whichOnPath('bravos', env)) return null;
  if (env.BRAVOS_GRAPH_PROBE === 'off') return 'cli';
  const r = await capture('bravos', ['graph', 'acceptance-register', '--json'], { cwd: root, env, timeoutMs });
  if (r.timedOut || r.error) return 'cli';
  try {
    const j = JSON.parse(r.stdout);
    if (j?.error === 'codegraph_unavailable') return 'not-built';
    if (j?.error === 'licence_required') return 'locked';
    if (r.status === 0 && j?.result) return 'current';
  } catch {
    /* not JSON: say nothing more than that bravos is there */
  }
  return 'cli';
}

export async function collect(root, env, { deadlineMs = 20000, nextCount = 3 } = {}) {
  const deadline = Date.now() + deadlineMs;
  const budget = () => Math.min(10000, Math.max(0, deadline - Date.now()));
  // Everything started now shares one budget; only the git diff, which waits for the base ref, gets less.
  const first = Math.min(10000, deadlineMs);
  const errors = [];

  const git = async (args, timeoutMs = first) => {
    const r = await capture('git', args, { cwd: root, env, timeoutMs });
    return r.timedOut || r.error || r.status !== 0 ? null : r.stdout.trim();
  };
  const gitFacts = (async () => {
    const [sha, ref, branch] = await Promise.all([
      git(['rev-parse', '--short', 'HEAD']),
      git(['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']),
      git(['rev-parse', '--abbrev-ref', 'HEAD']),
    ]);
    const base = ref || 'origin/main';
    const diff = await git(['diff', '--name-only', `${base}...HEAD`], budget());
    return { sha: sha ?? 'unknown', base, branch: branch && branch !== 'HEAD' ? branch : null, changedFiles: diff ? diff.split('\n').filter(Boolean) : [] };
  })();

  const hasGuardlink = whichOnPath('guardlink', env);
  const run = (label, args) =>
    hasGuardlink ? runJsonAsync('guardlink', args, { cwd: root, env, timeoutMs: first }).then((r) => ({ label, r })) : null;
  const glRuns = [
    run('ci', ['ci', '-f', 'json']),
    run('hypothesis next', ['hypothesis', 'next', '--json', '-n', String(nextCount)]),
    run('lookup tickets', ['lookup', 'tickets']),
  ];
  const prRun = runJsonAsync('gh', ['pr', 'list', '--state', 'open', '--json', 'number,files', '--limit', '50'], {
    cwd: root,
    env,
    timeoutMs: first,
  });

  const graphRun = probeGraph(root, env, Math.min(3000, first));
  // A signed-in machine's device licence is renewed here when it is due, alongside the other facts and under a short timeout of its own; it fails open, so a slow or absent portal only means the held token is read as it is.
  const renewal = refreshIfDue(env, { timeoutMs: Math.min(3000, first) }).catch(() => null);
  // At an app folder, each member's counts come from its own guardlink ci, alongside the rest.
  const workspace = readWorkspace(root);
  const countsRun = workspace?.isAppFolder && hasGuardlink ? memberCounts(workspace, runJsonAsync, env, first) : Promise.resolve(null);
  const [facts, pr, graphState, workspaceCounts, , ...gl] = await Promise.all([gitFacts, prRun, graphRun, countsRun, renewal, ...glRuns]);

  let guardlink = 'missing';
  if (hasGuardlink) {
    // Errors are recorded in command order so the degraded lines read the same on every run.
    const val = ({ label, r }) => {
      if (r.ok) return r.json;
      errors.push(r.error.replace(/^guardlink/, `guardlink ${label}`));
      return null;
    };
    guardlink = { ci: val(gl[0]), next: val(gl[1]), tickets: val(gl[2]), unannotated: null };
  }

  let inFlight = null;
  if (pr.ok && Array.isArray(pr.json)) {
    const files = new Set();
    for (const p of pr.json) for (const f of p.files ?? []) files.add(f.path ?? f);
    inFlight = { files: files.size, prs: pr.json.length, numbers: pr.json.map((p) => p.number).filter((n) => typeof n === 'number') };
  }

  return {
    root,
    repo: basename(root),
    sha: facts.sha,
    base: facts.base,
    branch: facts.branch,
    guardlink,
    changedFiles: facts.changedFiles,
    inFlight,
    intent: readIntent(root),
    // bravos on PATH: what its probe says (a graph for this commit or not); else codegraph-mcp on PATH means the MCP route.
    codegraph: graphState ?? (whichOnPath('codegraph-mcp', env) ? 'unknown' : 'unavailable'),
    sast: { summary: readSast(root, env), available: sastAvailable(env) },
    licence: licenceStatus(env),
    harness: env.CLAUDE_PROJECT_DIR ? 'claude' : 'other',
    prePr: prePrRegistered(root),
    shadow: userSkillsShadow(root, env),
    autopilot: autopilotRegistered(root),
    proving: readProving(root),
    workspace,
    workspaceCounts,
    errors,
  };
}

// ---------------------------------------------------------------------------------------------
// Startup banner: shown to the human (systemMessage), never added to the model's context.
// ---------------------------------------------------------------------------------------------

const BANNER_WIDTH = 80;
// A large shadowed wordmark, six rows, built letter by letter so every row has the same width.
const GLYPHS = {
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  V: ['██╗   ██╗', '██║   ██║', '██║   ██║', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚═══╝  '],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
};
export const LOGO = Array.from({ length: 6 }, (_, r) => [...'BRAVOS'].map((c) => GLYPHS[c][r]).join(''));
const LOGO_WIDTH = Math.max(...LOGO.map((l) => [...l].length));
// bravos's mascot: a hooded figure with two glowing eyes, eleven rows, left-right symmetric; ▓ is the hood, █ the eyes.
export const MASCOT = [
  '        ▄▄▓▓▓▓▓▓▄▄        ',
  '▄▄▄▄▄ ▄▓▓▓▓▓▓▓▓▓▓▓▓▄ ▄▄▄▄▄',
  ' ▀▀▓▓▓▓▓▀▀▀▀▀▀▀▀▀▀▓▓▓▓▓▀▀ ',
  '   ▓▓▓▀            ▀▓▓▓   ',
  '  ▓▓▓  ▄██▄    ▄██▄  ▓▓▓  ',
  '  ▓▓▓  ████▄  ▄████  ▓▓▓  ',
  '  ▓▓▓  ▀████  ████▀  ▓▓▓  ',
  '  ▓▓▓   ▀▀█▌  ▐█▀▀   ▓▓▓  ',
  '   ▀▓▓▄            ▄▓▓▀   ',
  '   ▄▓▓▓▓▄▄▄▄▄▄▄▄▄▄▓▓▓▓▄   ',
  '  ▓▓▓▓▓▓▓▓ ▐  ▌ ▓▓▓▓▓▓▓▓  ',
];
const MASCOT_WIDTH = 26;
const LEFT_WIDTH = 36;
const INTRO = [
  'bravos makes this agent a guardlink power user: it keeps the threat model',
  'beside the code, proves exposures with authorized cxg runs on targets you own,',
  'and gates pull requests on what they change. For developers and security alike.',
];

export const fit = (s, w) => (s.length <= w ? s : s.slice(0, Math.max(0, w - 1)) + '…');

// @comment -- "True when a harness settings file in the repo registers bravos's pre-PR gate; read-only, and unreadable files read as off."
export function prePrRegistered(root) {
  for (const rel of ['.claude/settings.json', '.codex/hooks.json']) {
    try {
      const groups = JSON.parse(readFileSync(join(root, rel), 'utf8'))?.hooks?.PreToolUse;
      if (Array.isArray(groups) && groups.some((g) => arr(g?.hooks).some((h) => typeof h?.command === 'string' && h.command.includes('.bravos/hooks/pre-pr.mjs')))) return true;
    } catch {
      /* not registered here */
    }
  }
  return false;
}

// @comment -- "True when a harness settings file in the repo registers bravos's autopilot Stop hook; read-only, unreadable files read as off."
export function autopilotRegistered(root) {
  for (const rel of ['.claude/settings.json', '.codex/hooks.json']) {
    try {
      const groups = JSON.parse(readFileSync(join(root, rel), 'utf8'))?.hooks?.Stop;
      if (Array.isArray(groups) && groups.some((g) => arr(g?.hooks).some((h) => typeof h?.command === 'string' && h.command.includes('.bravos/hooks/autopilot.mjs')))) return true;
    } catch {
      /* not registered here */
    }
  }
  return false;
}

// @comment -- "Detects a user-level bravos install (bravos init --global) whose version differs from this repo's: Claude Code prefers personal skills over project skills of the same name, so an older ~/.claude/skills copy silently replaces the repo's. Returns { user, repo } versions, or null when there is no conflict."
export function userSkillsShadow(root, env) {
  const home = env?.HOME;
  if (!home) return null;
  let user = null;
  try {
    user = JSON.parse(readFileSync(join(home, '.bravos', 'skills.lock'), 'utf8')).bravos_version ?? null;
  } catch {
    return null;
  }
  if (join(home) === join(root)) return null;
  const repo = readVersion(join(root, '.bravos', 'hooks'));
  if (!user || !repo || user === repo) return null;
  return { user, repo, userNewer: compareVersions(user, repo) > 0 };
}

/** Compares dotted versions numerically (0.12.1 > 0.12.0, 0.10.0 > 0.9.9); non-numeric parts compare as 0. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let k = 0; k < Math.max(pa.length, pb.length); k++) {
    const d = (pa[k] ?? 0) - (pb[k] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// @comment -- "Reads the installed bravos version for the banner: the repo's .bravos/skills.lock beside the hooks dir, else a plugin manifest; null when none is readable."
export function readVersion(hooksDir) {
  const tries = [
    [join(dirname(hooksDir), 'skills.lock'), (j) => j.bravos_version],
    [join(dirname(hooksDir), '.claude-plugin', 'plugin.json'), (j) => j.version],
    [join(dirname(hooksDir), 'plugin.json'), (j) => j.version],
  ];
  for (const [file, pick] of tries) {
    try {
      const v = pick(JSON.parse(readFileSync(file, 'utf8')));
      if (typeof v === 'string' && v) return v;
    } catch {
      /* try the next */
    }
  }
  return null;
}

/** Open exposures grouped by threat, ranked by highest severity then count (the tui's order). */
export function topThreats(exposures, n = 3) {
  const by = new Map();
  for (const e of arr(exposures)) {
    const id = e?.threat ?? assetThreat(e).threat;
    const cur = by.get(id) ?? { threat: id, count: 0, severity: 'unset' };
    cur.count += 1;
    if (sevRank(e?.severity) < sevRank(cur.severity)) cur.severity = e.severity;
    by.set(id, cur);
  }
  return [...by.values()]
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || b.count - a.count || a.threat.localeCompare(b.threat))
    .slice(0, n);
}

const SKILL_HINT = {
  'bravos-recheck': 'recheck a fix',
  'bravos-context': 'record intent',
  'bravos-annotate': 'cover unannotated',
  'bravos-templatize': 'write templates',
  bravos: 'where to start',
  'bravos-ship': 'check before a PR',
};

/** Three skills chosen from state, bravos-ship always last; `harness` picks /x (Claude Code), $x (Codex), /skill:x (omp) or the bare name. */
export function quickStart(inputs, harness) {
  const g = inputs?.guardlink && typeof inputs.guardlink === 'object' ? inputs.guardlink : {};
  const ci = g.ci;
  const picks = [];
  if (arr(ci?.confirmed).length > 0) picks.push('bravos-recheck');
  if (inputs?.intent?.status === 'none') picks.push('bravos-context');
  const cov = ci?.summary?.coverage;
  if (cov && num(cov.source_files) > num(cov.annotated_files)) picks.push('bravos-annotate');
  if (arr(g.next?.queue).some((q) => q?.state === 'untested')) picks.push('bravos-templatize');
  const chosen = picks.slice(0, 2);
  if (chosen.length < 2) chosen.unshift('bravos');
  chosen.push('bravos-ship');
  const sigil = SIGIL[harness] ?? '';
  return chosen.slice(0, 3).map((name) => ({ name, command: sigil + name, hint: SKILL_HINT[name] }));
}

const SIGIL = { claude: '/', codex: '$', omp: '/skill:', opencode: '/' };

// One tip a day, the same for the whole team that day; each fits on one 80-column line.
const TIPS = [
  'say the effort you want: "annotate at high", or bravos effort: high in AGENTS.md.',
  'only a reproduced run confirms a finding; reading the code never does.',
  'run bravos doctor to see which of guardlink, cxg, codegraph-mcp, bravos-cli you have.',
  '"unknown" in the briefing means a tool failed, never that the count is zero.',
  'bravos-campaign clears big backlogs in rounds of subagents, with rests between.',
  'bravos init --pre-pr-hook runs the ship gate on every gh pr create.',
  'intended-by-design behaviour goes in .guardlink/intent.md, not in @accepts.',
  'stale means the code under a claim changed; bravos-recheck clears it.',
  'anything beyond loopback needs a reviewed scope.yaml and your typed authorization.',
  'teammates see the same picture: the threat model lives in git, not in bravos.',
  'bravos guide --markdown prints the whole guide; docs/GUIDE.md has a copy.',
  'BRAVOS_BANNER=off hides this banner; the agent still gets the briefing.',
];
const dayNumber = () => Math.floor(Date.now() / 86400000);

function countsLine(g) {
  const ci = g.ci;
  if (!ci) return 'threat counts unknown (guardlink ci unavailable)';
  const s = ci.summary ?? {};
  const list = arr(ci.exposures);
  const by = s.by_severity ?? Object.fromEntries(SEVERITIES.map((k) => [k, list.filter((e) => e?.severity === k).length]));
  const total = typeof s.exposures === 'number' ? s.exposures : list.length;
  const sev = SEVERITIES.filter((k) => num(by[k]) > 0).map((k) => `${num(by[k])} ${k}`);
  let line = `${total} open${sev.length ? ` (${sev.join(', ')})` : ''} · ${arr(ci.confirmed).length} confirmed`;
  if (s.coverage) line += ` · coverage ${num(s.coverage.percent)}% (${num(s.coverage.annotated_files)}/${num(s.coverage.source_files)})`;
  return line;
}

function statusLine(i) {
  const intent = i.intent?.status ?? 'unknown';
  const graph = i.codegraph === 'unavailable' ? 'graph off' : i.codegraph === 'not-built' ? 'graph none' : i.codegraph === 'diverged' ? 'graph stale' : 'graph on';
  const sast = i.sast?.summary ? `sast ${i.sast.summary.reachable} reachable` : i.sast?.available?.ok ? 'sast not run' : 'sast off';
  const setup = i.root ? readSetup(i.root, i, i.harness) : null;
  return `intent ${intent} · ${graph} · pre-PR ${i.prePr ? 'on' : 'off'} · auto ${i.autopilot ? 'on' : 'off'} · ${sast}${setup ? ` · setup ${setup.done}/${setup.total}` : ''}`;
}

/**
 * Builds the startup banner for the human: logo, repo and counts, top threats (or FIX NOW) beside a
 * state-driven quick start, and a short introduction while the product's intent is not recorded.
 * Plain text, no ANSI; every line ≤ 80 columns; 35 lines at most with the introduction, 29 without.
 */
// @comment -- "Pure text builder for the user-facing startup banner; reads only the inputs collect() already gathered, never throws on partial inputs."
export function buildBanner(inputs, opts = {}) {
  const i = inputs ?? {};
  const harness = opts.harness ?? (i.harness === 'claude' ? 'claude' : 'other');
  // The mascot on the left; the wordmark beside its face, the repo facts beside its shoulders.
  const room = BANNER_WIDTH - MASCOT_WIDTH - 2;
  const facts = [
    [`bravos${opts.version ? ` ${opts.version}` : ''}`, i.repo].filter(Boolean).join(' · '),
    [i.branch, i.sha ? `@ ${i.sha}` : ''].filter(Boolean).join(' '),
  ];
  const header = ['', '', ...LOGO, '', ...facts];
  const lines = MASCOT.map((row, r) => `${row}  ${fit(header[r] ?? '', room)}`);

  if (i.guardlink === 'missing') {
    lines.push('', 'guardlink not found on PATH — run bravos doctor');
    const out = lines.map((l) => fit(l.trimEnd(), BANNER_WIDTH));
    return (opts.color ? colorize(out, i) : out).join('\n');
  }
  const g = i.guardlink ?? {};
  lines.push('', countsLine(g), statusLine(i));
  if (i.shadow) {
    lines.push(i.shadow.userNewer
      ? `~ repo bravos ${i.shadow.repo} is behind your ${i.shadow.user} · run: bravos sync`
      : `! your user-level bravos ${i.shadow.user} overrides repo ${i.shadow.repo} · run: bravos sync --global`);
  }
  lines.push('');

  const confirmed = arr(g.ci?.confirmed).slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  let left;
  if (confirmed.length > 0) {
    left = [`FIX NOW — confirmed (${confirmed.length})`, ...confirmed.slice(0, 3).map((c) => {
      const { threat } = assetThreat(c);
      const file = basename(String(c?.location?.file ?? c?.file ?? '?'));
      return `${threat} ${file}:${c?.location?.line ?? c?.line ?? '?'}`;
    })];
  } else if (!g.ci) {
    left = ['Top threats', 'unknown'];
  } else {
    const top = topThreats(g.ci.exposures);
    // The count is kept and a long threat id is shortened, so the column never loses the ×n.
    const row = (t) => {
      const head = `${t.severity.padEnd(9)}`;
      const tail = ` ×${t.count}`;
      return head + fit(t.threat, BANNER_WIDTH - head.length - tail.length) + tail;
    };
    left = ['Top threats', ...(top.length ? top.map(row) : ['none open'])];
  }
  // One column: the Next line below carries the step to take, so the old Quick start column is gone.
  for (const row of left) lines.push(fit(row, BANNER_WIDTH));

  // By role and by task: the skill each starts with, in the harness's own syntax.
  const sk = (name) => (SIGIL[harness] ?? '') + name;
  const roles = [['developer', 'bravos-annotate'], ['security', 'bravos-prove'], ['team lead', 'bravos-campaign'], ['new here', 'bravos']];
  const tasks = [['what next?', 'bravos'], ['before a PR', 'bravos-ship'], ['after a fix', 'bravos-recheck'], ['find routes', 'bravos-codegraph']];
  lines.push('', 'If you are'.padEnd(LEFT_WIDTH) + 'To');
  for (let r = 0; r < roles.length; r++) {
    lines.push(fit(`${roles[r][0].padEnd(11)}${sk(roles[r][1])}`, LEFT_WIDTH - 2).padEnd(LEFT_WIDTH) + `${tasks[r][0].padEnd(13)}${sk(tasks[r][1])}`);
  }
  const setup = i.root ? readSetup(i.root, i, harness) : null;
  // The next step with its command; the pointer to bravos next is dropped when the command is long.
  const nextFull = setup?.next ? `Next: ${setup.next.label} → ${setup.next.cta} · more: bravos next` : null;
  const nextLine = nextFull && nextFull.length > BANNER_WIDTH ? `Next: ${setup.next.label} → ${setup.next.cta}` : nextFull;
  lines.push('', fit(nextLine ?? `Tip: ${TIPS[(opts.day ?? dayNumber()) % TIPS.length]}`, BANNER_WIDTH));
  lines.push('Guide (free, no tokens): bravos guide · bravos guide roles · bravos guide tasks');

  if (i.intent?.status === 'none') {
    lines.push('', ...INTRO, `Start with the Next step above, or ask "help me get started" (${SIGIL[harness] ? `${SIGIL[harness]}bravos` : 'the bravos skill'}).`, 'Hide this banner with BRAVOS_BANNER=off.');
  }
  const out = lines.map((l) => fit(l.trimEnd(), BANNER_WIDTH)).slice(0, i.intent?.status === 'none' ? 35 : 29);
  return (opts.color ? colorize(out, i) : out).join('\n');
}

// @comment -- "A three-line, uncoloured summary for harnesses that show a hook's message as a warning or notice rather than in the transcript (Codex)."
export function buildSummary(inputs, opts = {}) {
  const i = inputs ?? {};
  const head = `bravos${opts.version ? ` ${opts.version}` : ''} · ${[i.repo, i.branch].filter(Boolean).join(' · ')}`;
  const guide = 'guide, free and offline: bravos guide (roles, tasks, every skill)';
  if (i.guardlink === 'missing') return `${head}\nguardlink not found on PATH — run bravos doctor\n${guide}`;
  const next = quickStart(i, opts.harness).map((q) => q.command).join(' · ');
  const setup = i.root ? readSetup(i.root, i, opts.harness) : null;
  const third = setup ? `setup ${setup.done}/${setup.total}${setup.next ? ` · next: ${setup.next.label} · bravos next` : ''} · bravos guide` : guide;
  return `${head} · ${countsLine(i.guardlink ?? {})}\nintent ${i.intent?.status ?? 'unknown'} · skills: ${next}\n${third}`;
}

// Brand palette. Colour is truecolor ANSI, added after layout so widths are measured on plain text.
export const PALETTE = {
  green: '#33d49d', navy: '#1f3943', blue: '#0360a2', light: '#f0f0f0',
  steel: '#55899e', red: '#ea1d1d', slate: '#3b6779', black: '#000000', white: '#ffffff',
};
const fg = (hex) => `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`;
const RESET = '\x1b[0m';
export const paint = (text, hex, bold = false) => `${bold ? '\x1b[1m' : ''}${fg(hex)}${text}${RESET}`;

// @comment -- "Colours banner lines with the brand palette: the mascot's hood in slate and steel with green eyes, the wordmark in green with a blue shadow, severities by weight (critical and high in red), skills in green, and supporting text in steel; pure string transform."
export function colorize(lines, inputs = {}) {
  const P = PALETTE;
  // One escape per run of same-coloured characters, so the banner stays far inside the 10,000-character cap.
  const runs = (chars, colourOf) => {
    let out = '';
    let cur = null;
    let buf = '';
    const flush = () => {
      if (buf) out += cur ? paint(buf, cur) : buf;
      buf = '';
    };
    for (const c of chars) {
      const k = c === ' ' ? cur : colourOf(c);
      if (k !== cur) {
        flush();
        cur = k;
      }
      buf += c;
    }
    flush();
    return out;
  };
  const mascotColour = (c) => (c === '▓' ? P.slate : c === '▄' || c === '▀' ? P.steel : '█▐▌'.includes(c) ? P.green : null);
  const wordColour = (c) => (c === '█' ? P.green : '╗╔╝╚═║'.includes(c) ? P.blue : null);
  return lines.map((line, n) => {
    if (n < MASCOT.length) {
      const chars = [...line];
      const left = runs(chars.slice(0, MASCOT_WIDTH), mascotColour);
      const rest = chars.slice(MASCOT_WIDTH).join('');
      if (n >= 2 && n < 2 + LOGO.length) return left + runs([...rest], wordColour);
      if (n === MASCOT.length - 2) return left + rest.replace(/bravos( [\d.]+)?/, (m) => paint(m, P.green, true)).replace(/ · (.+)$/, (_m, r) => ` · ${paint(r, P.light, true)}`);
      if (n === MASCOT.length - 1) return left + rest.replace(/\S.*$/, (m) => paint(m, P.steel));
      return left + rest;
    }
    if (/^If you are/.test(line)) return line.replace(/^If you are/, paint('If you are', P.light, true)).replace(/To$/, paint('To', P.light, true));
    if (/^(developer|security|team lead|new here) /.test(line)) {
      return line.split(/((?:\/skill:|\/|\$)?bravos(?:-[a-z]+)?(?= |$))/).map((part, k) => (k % 2 ? paint(part, P.green) : part)).join('');
    }
    if (/^! your user-level bravos/.test(line)) return paint(line, P.red, true);
    if (/^~ repo bravos /.test(line)) return paint(line, P.steel);
    if (/^Tip: /.test(line)) return paint('Tip: ', P.green, true) + paint(line.slice(5), P.light);
    if (/^Next: /.test(line)) {
      const [what, rest = ''] = line.slice(6).split(' → ');
      const [cta, tailText] = rest.split(' · more: ');
      return paint('Next: ', P.green, true) + paint(what, P.light) + (cta ? ` → ${paint(cta, P.green)}` : '') + (tailText !== undefined ? ` · more: ${paint(tailText, P.green)}` : '');
    }
    if (/^Guide \(free/.test(line)) return line.replace(/^Guide \(free, no tokens\):/, (m) => paint(m, P.steel)).replace(/bravos guide[a-z ]*/g, (m) => paint(m, P.green));
    if (/^(Top threats|FIX NOW)/.test(line)) {
      return line
        .replace(/^Top threats/, paint('Top threats', P.light, true))
        .replace(/^FIX NOW — confirmed \(\d+\)/, (m) => paint(m, P.red, true))
        .replace(/Quick start( \(skills\))?/, (m) => paint(m, P.light, true));
    }
    let l = line
      .replace(/^(critical|high)(?= )/, (m) => paint(m, P.red, true))
      .replace(/^medium(?= )/, (m) => paint(m, P.light))
      .replace(/^low(?= )/, (m) => paint(m, P.steel))
      .replace(/(\d+) (critical|high)\b/g, (m) => paint(m, P.red))
      .replace(/\b([1-9]\d*) confirmed\b/, (m) => paint(m, P.red, true))
      .replace(/\b0 confirmed\b/, (m) => paint(m, P.green))
      .replace(/coverage \d+%( \(\d+\/\d+\))?/, (m) => paint(m, P.green))
      .replace(/((?:\/skill:|\/|\$)bravos(?:-[a-z]+)?)(\s+)([^\x1b]+)$/, (_m, cmd, sp, hint) => `${paint(cmd, P.green)}${sp}${paint(hint, P.steel)}`)
      .replace(/(?<![\w/$:-])((?:\/skill:|\/|\$)bravos(?:-[a-z]+)?)(?![\w-])(?![^\x1b]*\x1b\[0m)/g, (m) => paint(m, P.green));
    if (/^(Start with|Hide this|bravos makes|beside the|and gates)/.test(line)) {
      l = line.split(/((?:\/skill:|\/|\$)bravos-[a-z]+)/).map((part, k) => (k % 2 ? paint(part, P.green) : part ? paint(part, P.steel) : '')).join('');
    }
    return l;
  });
}
