// @comment -- "The pre-PR gate behind bravos's opt-in PreToolUse hook, matching bravos-ship's rulings: recognises gh pr create / gh pr ready in a Bash command, runs guardlink validate, lint --since <base> --json, diff <base> --json (each new unmitigated exposure must be disclosed in the PR body by threat and asset id) and ci -f json (a confirmed claim on a changed file blocks unless that file carries a @ticket for it), and returns allow or block with a reason. A gate input that fails or does not parse blocks as unknown. Read-only: every command is spawned with an argv array, no shell, a per-spawn timeout and one shared deadline."
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const PR_COMMAND = /(?:^|[\s;&|(])gh\s+pr\s+(create|ready)(?![\w-])/;
const READY_ARG = /(?:^|[\s;&|(])gh\s+pr\s+ready\s+([^\s;&|)-][^\s;&|)]*)/;
const BODY_FILE = /(?:--body-file|-F)[=\s]+("([^"]+)"|'([^']+)'|(\S+))/;
// @comment -- "The hook is registered with a 180 s timeout; the whole gate shares 150 s so it always answers before the harness kills it."
export const GATE_DEADLINE_MS = 150000;
// @comment -- "The person's recorded proving preference (see autopilot.mjs readProving); a branch that changes it must disclose that in the PR body."
export const PROVING_FILE = '.guardlink/proving.md';
const SPAWN_CAP_MS = 60000;

/** Which gh pr action a shell command runs, or null when it runs neither. */
export function prAction(command) {
  if (typeof command !== 'string') return null;
  const m = PR_COMMAND.exec(command);
  return m ? m[1] : null;
}

/** The PR number, URL or branch `gh pr ready <arg>` names, or null for the current branch's PR. */
export function readyTarget(command) {
  const m = READY_ARG.exec(command ?? '');
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

/**
 * The PR body text a `gh pr create` command carries: the command string itself (an inline --body or a
 * heredoc is part of it) plus the file a --body-file / -F names, resolved under the project root.
 */
// @comment -- "Reads the PR body from the command string (inline --body or heredoc) and from the --body-file / -F path it names, resolved under the project root; an unreadable file adds nothing."
export function commandBody(command, root) {
  let body = typeof command === 'string' ? command : '';
  const m = BODY_FILE.exec(body);
  if (!m) return body;
  const rel = m[2] ?? m[3] ?? m[4];
  if (rel === '-') return body;
  const path = isAbsolute(rel) ? rel : join(root, rel);
  try {
    if (existsSync(path)) body += '\n' + readFileSync(path, 'utf8');
  } catch {
    // unreadable: the command text alone is the body
  }
  return body;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether `text` names the threat-model id `id` as a whole token (`#api` is not found in `#api-key`). */
export function mentionsId(text, id) {
  if (typeof id !== 'string' || id === '') return false;
  return new RegExp(`(?<![\\w#.-])${escapeRe(id)}(?![\\w-])`).test(text);
}

/** Default runner: argv array, no shell, stdin closed, timeout capped at 60 s. */
export function spawnRunner(cmd, args, { cwd, env, timeoutMs = SPAWN_CAP_MS }) {
  const r = spawnSync(cmd, args, { cwd, env, timeout: Math.min(SPAWN_CAP_MS, timeoutMs), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) return { missing: r.error.code === 'ENOENT', error: r.error.code ?? r.error.message, status: null, stdout: '', stderr: '' };
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Wraps a runner so every spawn gets min(60 s, what is left of the shared deadline); past the deadline nothing is spawned. */
// @comment -- "Shared-deadline runner, as briefing.mjs collect() does: each spawn is capped individually and by the time left, and a spawn after the deadline returns a timed-out result instead of running."
export function withDeadline(run, deadlineMs = GATE_DEADLINE_MS, now = Date.now) {
  const deadline = now() + deadlineMs;
  return (cmd, args, opts) => {
    const left = deadline - now();
    if (left <= 0) return { status: null, error: 'ETIMEDOUT', stdout: '', stderr: '' };
    return run(cmd, args, { ...opts, timeoutMs: Math.min(SPAWN_CAP_MS, left) });
  };
}

const tail = (s, n = 40) => s.trim().split('\n').slice(-n).join('\n');
const why = (r) => (r.error === 'ETIMEDOUT' ? 'timed out' : r.error ? r.error : `exited ${r.status}`);

/** Runs a command and parses its stdout as JSON: `{ ok: true, json }` or `{ ok: false, error }` naming what failed. */
function runJson(run, label, cmd, args, opts, okStatus = [0]) {
  const r = run(cmd, args, opts);
  if (r.error || !okStatus.includes(r.status)) return { ok: false, error: `${label} ${why(r)}`, detail: tail((r.stdout ?? '') + (r.stderr ?? ''), 10) };
  try {
    return { ok: true, json: JSON.parse(r.stdout) };
  } catch {
    return { ok: false, error: `${label} output was not JSON`, detail: tail(r.stdout ?? '', 10) };
  }
}

/** The repository root for a working directory: git's top level, else CLAUDE_PROJECT_DIR, else the directory itself. */
// @comment -- "guardlink reports paths relative to the directory it runs in and git diff --name-only reports them relative to the top level, so the gate must run everything from the top level: a payload cwd in a subdirectory otherwise empties the confirmed-on-changed-file intersection and the gate passes."
export function resolveRoot(cwd, env = process.env, run = spawnRunner) {
  const top = run('git', ['rev-parse', '--show-toplevel'], { cwd, env });
  if (top.status === 0 && top.stdout.trim()) return top.stdout.trim();
  return env.CLAUDE_PROJECT_DIR || cwd;
}

/** The merge base the gate judges against, or null when it cannot be found. */
export function findBase(root, env, run = spawnRunner) {
  const head = run('git', ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, env });
  const def = head.status === 0 && head.stdout.trim() ? head.stdout.trim().replace(/^origin\//, '') : 'main';
  for (const ref of [`origin/${def}`, def]) {
    const mb = run('git', ['merge-base', 'HEAD', ref], { cwd: root, env });
    if (mb.status === 0 && mb.stdout.trim()) return mb.stdout.trim();
  }
  return null;
}

/** Whether `file` (repo-relative, under root) has a `@ticket` line naming both `threat` and `asset`. */
// @comment -- "The ship gate's carve-out for a confirmed claim: a @ticket line in the same file naming that threat and that asset. Who wrote it is bravos-ship's check (blame), not this hook's."
export function hasTicket(root, file, threat, asset) {
  let text;
  try {
    text = readFileSync(isAbsolute(file) ? file : join(root, file), 'utf8');
  } catch {
    return false;
  }
  return text.split('\n').some((l) => l.includes('@ticket') && mentionsId(l, threat) && mentionsId(l, asset));
}

/**
 * Decide whether a gh pr action may proceed. Returns { decision: 'allow' | 'block', reason }.
 * Fails open (allow, with the reason) only when it cannot judge at all: guardlink absent or no merge base.
 * Every other input that fails or does not parse blocks as "unknown".
 */
// @comment -- "validate, lint, the disclosure check and the confirmed check gate create and ready; an @exposes plus @audit stays listed by design and is reported, so disclosure by id in the PR body is the only way past a new exposure. Every command runs with cwd root; a --body-file is resolved against cwd, where the gh command would run. On ready the body comes from gh pr view, and a failed read blocks as unknown. action 'check' (a manual run before any PR exists) has no body: it lists the new exposures to disclose and blocks only on lint, confirmed claims and unknown inputs."
export function runGate({ root, action, command, cwd = root, env = process.env, run: baseRun = spawnRunner, deadlineMs = GATE_DEADLINE_MS }) {
  const run = withDeadline(baseRun, deadlineMs);
  const o = { cwd: root, env };
  const validate = run('guardlink', ['validate', '.'], o);
  if (validate.missing) return { decision: 'allow', reason: 'bravos pre-PR gate: guardlink not on PATH, nothing checked' };
  if (validate.error) return { decision: 'block', reason: `bravos pre-PR gate: unknown: guardlink validate ${why(validate)}` };
  if (validate.status !== 0) {
    return { decision: 'block', reason: `bravos pre-PR gate: guardlink validate failed. Fix what it reports, or run bravos-ship.\n${tail(validate.stdout + validate.stderr)}` };
  }

  const base = findBase(root, env, run);
  if (!base) return { decision: 'allow', reason: 'bravos pre-PR gate: no merge base with the default branch found, lint, diff and ci not run' };

  const blocks = [];
  const notes = [];
  const unknown = (r) => blocks.push(`unknown: ${r.error}${r.detail ? `\n${r.detail}` : ''}`);

  // (a) lint errors on the branch's claims. lint exits non-zero when it reports errors, so its JSON decides.
  const lint = runJson(run, `guardlink lint --since ${base}`, 'guardlink', ['lint', '.', '--since', base, '--json'], o, [0, 1]);
  const errors = lint.ok ? lint.json?.summary?.errors : undefined;
  if (!lint.ok) unknown(lint);
  else if (typeof errors !== 'number') unknown({ error: `guardlink lint --since ${base} JSON has no summary.errors` });
  else if (errors > 0) blocks.push(`guardlink lint --since ${base} reports ${errors} error(s). Apply each violation's fix to lines this branch wrote (bravos-ship), then retry.`);

  // (b) each new unmitigated exposure is disclosed in the PR body by its threat and asset ids.
  const diff = runJson(run, `guardlink diff ${base}`, 'guardlink', ['diff', base, '--json'], o);
  const fresh = diff.ok ? diff.json?.newUnmitigatedExposures : undefined;
  if (!diff.ok) unknown(diff);
  else if (!Array.isArray(fresh)) unknown({ error: `guardlink diff ${base} JSON has no newUnmitigatedExposures` });
  else if (fresh.length > 0) {
    const list = (xs) => xs.map((e) => `  - ${e?.threat ?? '?'} on ${e?.asset ?? '?'} — ${e?.location?.file ?? '?'}:${e?.location?.line ?? '?'}`).join('\n');
    let body = null;
    if (action === 'create') body = commandBody(command, cwd);
    else if (action === 'ready') {
      const target = readyTarget(command);
      const view = runJson(run, 'gh pr view', 'gh', ['pr', 'view', ...(target ? [target] : []), '--json', 'body'], o);
      if (view.ok && typeof view.json?.body === 'string') body = view.json.body;
      else unknown(view.ok ? { error: 'gh pr view JSON has no body' } : { error: 'gh pr view failed', detail: view.error });
    } else {
      notes.push(`bravos pre-PR gate: ${fresh.length} new unmitigated exposure(s) against ${base}, to disclose in the PR body by threat and asset id:\n${list(fresh)}`);
    }
    if (body !== null) {
      const undisclosed = fresh.filter((e) => !(mentionsId(body, e?.threat) && mentionsId(body, e?.asset)));
      if (undisclosed.length > 0) {
        blocks.push(`this branch adds unmitigated exposure against ${base} that the PR body does not disclose. Name each threat and asset id in the PR body's Security gate section (bravos-ship writes it), then retry:\n${list(undisclosed)}`);
      }
    }
  }

  // (c) a confirmed-exploitable claim on a changed file blocks unless that file carries a @ticket for it.
  const ci = runJson(run, 'guardlink ci -f json', 'guardlink', ['ci', '-f', 'json'], o);
  const confirmed = ci.ok ? ci.json?.confirmed : undefined;
  if (!ci.ok) unknown(ci);
  else if (!Array.isArray(confirmed)) unknown({ error: 'guardlink ci -f json has no confirmed[]' });
  else if (confirmed.length > 0) {
    const names = run('git', ['diff', '--name-only', `${base}...HEAD`], o);
    if (names.error || names.status !== 0) unknown({ error: `git diff --name-only ${base}...HEAD ${why(names)}` });
    else {
      const changed = new Set(names.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
      const hits = confirmed.filter((c) => changed.has(c?.location?.file) && !hasTicket(root, c.location.file, c?.threat, c?.asset));
      if (hits.length > 0) {
        const list = hits.map((c) => `  - ${c?.severity ?? 'unrated'} ${c?.threat ?? '?'} on ${c?.asset ?? '?'} — ${c.location.file}:${c?.location?.line ?? '?'}`);
        blocks.push(`confirmed-exploitable claims sit on files this branch changes, with no @ticket for them in that file. A code change does not clear a confirmation; do not ship (bravos-ship step 7):\n${list.join('\n')}`);
      }
    }
  }

  // (d) a change to the recorded proving preference is a team decision: the PR body must say so.
  const touched = run('git', ['diff', '--name-only', `${base}...HEAD`], o);
  if (touched.status === 0 && touched.stdout.split('\n').some((l) => l.trim() === PROVING_FILE)) {
    let body = null;
    if (action === 'create') body = commandBody(command, cwd);
    else if (action === 'ready') {
      const view = runJson(run, 'gh pr view', 'gh', ['pr', 'view', ...(readyTarget(command) ? [readyTarget(command)] : []), '--json', 'body'], o);
      body = view.ok && typeof view.json?.body === 'string' ? view.json.body : null;
      if (body === null) unknown(view.ok ? { error: 'gh pr view JSON has no body' } : { error: 'gh pr view failed', detail: view.error });
    }
    const say = `this branch changes ${PROVING_FILE}, how the team wants findings proven; say "proving preference" in the PR body with what changed, so reviewers see it`;
    if (action === 'check') notes.push(`bravos pre-PR gate: ${say}.`);
    else if (body !== null && !/proving preference/i.test(body)) blocks.push(`${say}, then retry.`);
  }

  if (blocks.length > 0) return { decision: 'block', reason: ['bravos pre-PR gate: blocked.', ...blocks.map((b) => `- ${b}`), ...notes].join('\n') };
  return { decision: 'allow', reason: notes.join('\n') };
}
