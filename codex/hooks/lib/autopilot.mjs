// @comment -- "bravos autopilot's end-of-turn check (Claude Code and Codex Stop hooks): from the working-tree changes since HEAD it finds changed files with no GuardLink annotation, confirmed or stale claims on changed files, and open exposures on changed files, using only the two fast guardlink calls (unannotated and ci, run concurrently; lint and diff are left to the pre-PR gate because they take a minute on a large repo), and returns block with a short reason naming the skill to run, or allow. A nudge, not a gate: a missing tool, a timeout or bad input allows. Each finding is raised once per session (its key is looked up in the harness's transcript, which bravos only reads). Read-only: argv spawns, no shell."
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, fstatSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const AUTOPILOT_DEADLINE_MS = 20000;
const OUTPUT_CAP = 64 * 1024 * 1024;
const TRANSCRIPT_TAIL = 4 * 1024 * 1024;
const MAX_LIST = 5;

const arr = (v) => (Array.isArray(v) ? v : []);

// @comment -- "Async spawn with the pre-PR runner's result shape: argv array, no shell, stdin closed, output capped, killed at timeoutMs; never rejects."
export function asyncRunner(cmd, args, { cwd, env, timeoutMs = AUTOPILOT_DEADLINE_MS }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      resolve({ missing: e?.code === 'ENOENT', error: e?.code ?? String(e), status: null, stdout: '' });
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    child.stdout.on('data', (b) => {
      if (size < OUTPUT_CAP) chunks.push(b);
      size += b.length;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ status: null, error: 'ETIMEDOUT', stdout: '' });
    }, timeoutMs);
    child.on('error', (e) => finish({ missing: e.code === 'ENOENT', error: e.code ?? e.message, status: null, stdout: '' }));
    child.on('close', (status) => finish({ status, stdout: Buffer.concat(chunks).toString('utf8') }));
  });
}

async function json(run, args, o) {
  const r = await run('guardlink', args, o);
  if (r.missing || r.error) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

// @comment -- "Reads .guardlink/proving.md, the person's recorded answer to how findings should be proven (written by the agent from their words in bravos-env/bravos-prove): choice auto | ask | schedule | none, the loopback target, the start command, whether model-API generation is allowed, and who confirmed it. Anything without a named confirmation reads as not set."
export function readProving(root) {
  let text;
  try {
    text = readFileSync(join(root, '.guardlink', 'proving.md'), 'utf8');
  } catch {
    return { status: 'not set' };
  }
  const field = (name) => text.match(new RegExp(`^${name}:\\s*(\\S[^\\n]*?)\\s*$`, 'mi'))?.[1]?.replace(/\s+\(.*\)$/, '') ?? null;
  const by = text.match(/—\s*confirmed by\s+([^,\n]+?)\s*,\s*(\S+)/i);
  const choice = (field('choice') ?? '').toLowerCase().split(/\s/)[0];
  if (!by || !['auto', 'ask', 'schedule', 'none'].includes(choice)) return { status: 'not set' };
  return {
    status: 'set',
    choice,
    target: field('target'),
    start: field('start'),
    generation: /^(yes|true|allowed)/i.test(field('generation') ?? ''),
    by: by[1],
    date: by[2],
  };
}

/** Files changed in the working tree since HEAD, tracked or not. */
export async function changedFiles(root, env, run) {
  const o = { cwd: root, env };
  const out = new Set();
  const [diff, untracked] = await Promise.all([run('git', ['diff', '--name-only', 'HEAD'], o), run('git', ['ls-files', '--others', '--exclude-standard'], o)]);
  if (diff.status === 0) for (const l of diff.stdout.split('\n')) if (l.trim()) out.add(l.trim());
  if (untracked.status === 0) for (const l of untracked.stdout.split('\n')) if (l.trim()) out.add(l.trim());
  return out;
}

/** The last few MB of the harness transcript, to see which findings this session was already told about. */
function transcriptTail(path) {
  if (typeof path !== 'string' || !existsSync(path)) return '';
  try {
    const fd = openSync(path, 'r');
    try {
      const size = fstatSync(fd).size;
      const len = Math.min(size, TRANSCRIPT_TAIL);
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, size - len);
      return buf.toString('utf8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return '';
  }
}

const listOf = (all) => { const xs = [...new Set(all)]; return xs.slice(0, MAX_LIST).join(', ') + (xs.length > MAX_LIST ? ` and ${xs.length - MAX_LIST} more` : ''); };
const fileOf = (c) => c?.location?.file ?? c?.file;

/**
 * Runs the end-of-turn check. `payload` is the Stop hook's stdin (stop_hook_active, transcript_path).
 * Returns { decision: 'allow' } or { decision: 'block', reason }.
 */
// @comment -- "Decides the Stop hook's answer: allow when autopilot is off, the turn was already continued by a Stop hook, guardlink is absent, nothing changed or nothing new is found; otherwise block once with one line per finding and the skill that handles it, and for new exposures the next step the recorded proving preference implies."
export async function runAutopilot({ root, env = process.env, payload = {}, run = asyncRunner, deadlineMs = AUTOPILOT_DEADLINE_MS }) {
  if (env.BRAVOS_AUTOPILOT === 'off') return { decision: 'allow' };
  if (payload?.stop_hook_active === true) return { decision: 'allow' };
  if (!existsSync(join(root, '.guardlink'))) return { decision: 'allow' };
  const o = { cwd: root, env, timeoutMs: deadlineMs };

  const changed = await changedFiles(root, env, run);
  if (changed.size === 0) return { decision: 'allow' };

  // The two fast guardlink calls, side by side; a missing guardlink or a timeout reads as nothing found.
  const [wl, ci] = await Promise.all([json(run, ['unannotated', '--json'], o), json(run, ['ci', '-f', 'json'], o)]);

  const findings = [];
  // A short, stable key per finding: the same finding is raised once per session, a changed one again.
  const add = (key, line) => findings.push({ key: `[bravos-autopilot:${key.split(':')[0]}:${createHash('sha256').update(key).digest('hex').slice(0, 10)}]`, line });

  const worklist = arr(wl?.worklist).map((w) => (typeof w === 'string' ? w : w?.file ?? w?.path)).filter((f) => changed.has(f));
  if (worklist.length) add(`unannotated:${worklist.sort().join(',')}`, `${worklist.length} changed file(s) have no GuardLink annotation (${listOf(worklist)}): annotate the security-relevant code in them with bravos-annotate, or say why none is needed.`);

  const confirmed = arr(ci?.confirmed).filter((c) => changed.has(fileOf(c)));
  if (confirmed.length) {
    const ids = confirmed.map((c) => `${c.threat ?? '?'} at ${fileOf(c)}:${c?.location?.line ?? c?.line ?? '?'}`);
    add(`recheck:${ids.sort().join(',')}`, `you changed code under a confirmed exploit (${listOf(ids)}): run bravos-recheck to see whether the change fixed it, before finishing.`);
  }
  const stale = arr(ci?.stale).filter((c) => changed.has(fileOf(c)));
  if (stale.length) {
    const ids = stale.map((c) => `${fileOf(c)}:${c?.line ?? c?.location?.line ?? '?'}`);
    add(`stale:${ids.sort().join(',')}`, `${stale.length} claim(s) went stale in files you changed (${listOf(ids)}): re-read and re-verify them with bravos-recheck.`);
  }

  // Open exposures on the files this turn changed: what a proving decision is about.
  const confirmedKeys = new Set(confirmed.map((c) => `${c.threat}|${fileOf(c)}`));
  const open = arr(ci?.exposures).filter((e) => changed.has(fileOf(e)) && !confirmedKeys.has(`${e.threat}|${fileOf(e)}`));
  if (open.length) {
    const ids = open.map((e) => `${e?.threat ?? '?'} on ${e?.asset ?? '?'}`);
    const p = readProving(root);
    let next;
    if (p.status !== 'set') next = 'ask the person once how they want findings proven (automatically on their loopback target, each time you ask, on a schedule, or not now), and record their answer with bravos-prove';
    else if (p.choice === 'auto') next = `prove the untested ones with bravos-prove on ${p.target ?? 'the recorded loopback target'}, as .guardlink/proving.md records (${p.by}, ${p.date})`;
    else if (p.choice === 'ask') next = 'ask the person whether to prove them now (bravos-prove), as .guardlink/proving.md asks';
    else if (p.choice === 'schedule') next = 'leave them for the scheduled run .guardlink/proving.md names, and say so';
    else next = 'note them for the person; .guardlink/proving.md says not to prove for now';
    add(`prove:${ids.sort().join(',')}`, `${open.length} open exposure(s) sit on files this turn changed (${listOf(ids)}): ${next}.`);
  }

  if (findings.length === 0) return { decision: 'allow' };
  const seen = transcriptTail(payload?.transcript_path);
  const fresh2 = findings.filter((f) => !seen.includes(f.key));
  if (fresh2.length === 0) return { decision: 'allow' };
  const reason = [
    'bravos autopilot, before you finish:',
    ...fresh2.map((f) => `- ${f.line}`),
    'If something here does not apply, say why in one line and finish.',
    fresh2.map((f) => f.key).join(' '),
  ].join('\n');
  const summary = `sent the agent back once: ${fresh2[0].line}${fresh2.length > 1 ? ` (+${fresh2.length - 1} more)` : ''}`;
  return { decision: 'block', reason, summary, keys: fresh2.map((f) => f.key) };
}

export const WATCH_LOG_CAP = 500;

// @comment -- "Appends one autopilot nudge to .bravos/watch/events.jsonl for bravos watch to show: a local log, not a state store. The folder carries its own .gitignore of *, the file keeps its newest WATCH_LOG_CAP lines, and any failure is swallowed because the nudge itself already went out."
export function logWatchEvent(root, { summary, keys = [] }, now = new Date()) {
  try {
    const dir = join(root, '.bravos', 'watch');
    mkdirSync(dir, { recursive: true });
    const ignore = join(dir, '.gitignore');
    if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
    const file = join(dir, 'events.jsonl');
    appendFileSync(file, JSON.stringify({ at: now.toISOString(), text: String(summary ?? '').slice(0, 400), keys }) + '\n');
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    if (lines.length > WATCH_LOG_CAP) writeFileSync(file, lines.slice(-WATCH_LOG_CAP).join('\n') + '\n');
  } catch {
    /* the log is a convenience for bravos watch */
  }
}
