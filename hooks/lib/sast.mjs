// @comment -- "Reads bravos-sast's runs under .bravos/sast/<run>/ (bravos-cli analyze's bravos.analyze-report/v1 JSON plus bravos's meta.json): the newest run's counts, reach and staleness for the briefing, and its reachable findings grouped as candidates (joined to a GuardLink claim, not yet in the threat model, dependencies, secrets) for annotate, templatize, prove and recheck. Read-only; a missing or malformed report reads as null, never as zero findings. Dependency-free so it can be copied into target repos."
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { status as licenceStatus } from './licence.mjs';

export const REPORT_SCHEMA = 'bravos.analyze-report/v1';
export const CANDIDATES_SCHEMA = 'bravos.sast-candidates/v1';
const SAST_DIR = join('.bravos', 'sast');

const arr = (v) => (Array.isArray(v) ? v : []);

/** The report file inside a run folder: bravos-cli writes JSON next to the SARIF; the name varies by version. */
function reportFile(dir) {
  for (const name of ['report.json', 'analysis.json', 'bravos-analyze.json']) if (existsSync(join(dir, name))) return join(dir, name);
  const json = readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'meta.json' && !n.startsWith('candidates'));
  return json.length ? join(dir, json.sort()[0]) : null;
}

// @comment -- "Finds the newest run folder under .bravos/sast/ (by meta.json time, else folder mtime) and returns its parsed report and meta, or null when there is none or it is not a bravos.analyze-report/v1."
export function latestRun(root) {
  const base = join(root, SAST_DIR);
  if (!existsSync(base)) return null;
  const runs = [];
  for (const name of readdirSync(base)) {
    const dir = join(base, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    let meta = null;
    try {
      meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    } catch {
      meta = null;
    }
    const at = Date.parse(meta?.at ?? '') || statSync(dir).mtimeMs;
    runs.push({ name, dir, meta, at });
  }
  runs.sort((a, b) => b.at - a.at);
  for (const run of runs) {
    const file = reportFile(run.dir);
    if (!file) continue;
    try {
      const report = JSON.parse(readFileSync(file, 'utf8'));
      if (report?.schema !== REPORT_SCHEMA || !Array.isArray(report.findings)) continue;
      return { ...run, file, report };
    } catch {
      /* unreadable: try the next run */
    }
  }
  return null;
}

const isSecret = (f) => f?.finding_class === 'secret';
const isDep = (f) => f?.finding_class === 'dependency';
const joined = (f) => f?.guardlink_join && f.guardlink_join !== 'unjoined' && f.guardlink_join !== 'none';

// @comment -- "Summarizes the newest run for the briefing: findings by class and severity, reachable, reachable but not in the threat model, suppressed, and how many commits the report is behind HEAD (from meta.json's sha). Null when there is no usable report."
export function readSast(root, env = process.env) {
  const run = latestRun(root);
  if (!run) return null;
  const findings = arr(run.report.findings);
  const live = findings.filter((f) => !f?.suppressed);
  const reachable = live.filter((f) => f?.reachable === true);
  const byClass = {};
  for (const f of live) byClass[f?.finding_class ?? 'static_analysis'] = (byClass[f?.finding_class ?? 'static_analysis'] ?? 0) + 1;
  let staleCommits = null;
  if (typeof run.meta?.sha === 'string' && /^[0-9a-f]{7,40}$/.test(run.meta.sha)) {
    const r = spawnSync('git', ['rev-list', '--count', `${run.meta.sha}..HEAD`], { cwd: root, env, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status === 0) staleCommits = Number(r.stdout.trim());
  }
  return {
    run: run.name,
    sha: run.meta?.sha ?? null,
    exit: run.meta?.exit ?? null,
    total: live.length,
    reachable: reachable.length,
    unjoinedReachable: reachable.filter((f) => !joined(f) && !isSecret(f)).length,
    suppressed: findings.length - live.length,
    byClass,
    staleCommits,
  };
}

const where = (f) => ({
  rule: f?.rule_id ?? null,
  title: f?.title ?? null,
  severity: f?.severity ?? null,
  file: f?.file ?? null,
  line: f?.line ?? null,
  route: f?.http_method || f?.http_path ? `${f.http_method ?? ''} ${f.http_path ?? ''}`.trim() : null,
  entryPoint: f?.entry_point ?? null,
  pathLength: f?.path_length ?? null,
  function: f?.enclosing_function ?? null,
});

// @comment -- "Groups the newest run's non-suppressed findings for the other skills: joined to a claim (taint evidence for that threat), reachable but unjoined (leads for bravos-annotate), dependencies (with vulnerable-function reach) and secrets (never pentest candidates; the value is never included). Only reachable findings unless all is set."
export function sastCandidates(root, { all = false } = {}) {
  const run = latestRun(root);
  if (!run) return null;
  const live = arr(run.report.findings).filter((f) => !f?.suppressed && (all || f?.reachable === true || isSecret(f)));
  const out = { schema: CANDIDATES_SCHEMA, run: run.name, sha: run.meta?.sha ?? null, joined: [], unjoined: [], dependencies: [], secrets: [] };
  for (const f of live) {
    if (isSecret(f)) out.secrets.push({ rule: f?.rule_id ?? null, file: f?.file ?? null, line: f?.line ?? null, inHistory: !!f?.secret_in_history });
    else if (isDep(f)) out.dependencies.push({ ...where(f), manifests: arr(f?.dep_manifests), devOnly: !!f?.dep_dev_only, vulnerableFunctionReached: f?.vulnerable_function_reachability ?? null });
    else if (joined(f)) out.joined.push({ ...where(f), claimState: f.guardlink_join, confirmed: !!f?.guardlink_confirmed, accepted: !!f?.guardlink_accepted });
    else out.unjoined.push(where(f));
  }
  return out;
}

// @comment -- "One line for the claim a SAST finding joined: the analyzer's guardlink_join is an object ({asset, threat, declared_at, …}) in current reports and was a plain state string in older ones; both read as text, never as [object Object]."
export function claimLabel(cs) {
  if (cs == null) return 'claim';
  if (typeof cs !== 'object') return String(cs);
  const what = cs.asset && cs.threat ? `#${cs.asset} → #${cs.threat}` : cs.threat ? `#${cs.threat}` : 'claim';
  return cs.declared_at ? `${what} at ${cs.declared_at}` : what;
}

// @comment -- "One phrase for whether a dependency advisory's vulnerable function is reached: the analyzer reports {state, reason, …}; older reports carried a boolean or nothing."
export function reachLabel(v) {
  if (v == null) return 'unknown';
  if (typeof v !== 'object') return String(v);
  const state = v.state ?? 'unknown';
  return v.reason ? `${state} (${String(v.reason).replace(/_/g, ' ')})` : state;
}

// @comment -- "The Python bravos CLI (siete) on PATH, as `bravos` or renamed to `bravos-py`, and never this package's own `bravos` bin: an npm shim is a script that execs node on dist/cli.js, and skipping it keeps the hooks pointed at the Python install's analyzer and graph until phase 3 makes this CLI carry them."
export function pythonBravos(env = process.env) {
  // Its own name first, then bravos-py: the name it keeps once it is renamed so `bravos` means this CLI.
  for (const name of ['bravos', 'bravos-py']) {
    for (const dir of (env.PATH ?? '').split(delimiter)) {
      if (!dir) continue;
      const file = join(dir, name);
      try {
        if (!statSync(file).isFile()) continue;
        accessSync(file, constants.X_OK);
        const real = realpathSync(file);
        if (real.endsWith('dist/cli.js') || readFileSync(real, 'utf8').includes('dist/cli.js')) continue;
        return file;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

function onPath(name, env) {
  for (const dir of (env?.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    try {
      accessSync(join(dir, name), constants.X_OK);
      return join(dir, name);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

// @comment -- "Finds bravos-cli the way the bravos launcher puts it on its own PATH: on PATH first, else <install>/analyzer/bravos-cli beside the real path of the bravos launcher (<install>/bin/bravos). Read-only; null when neither has it."
export function findAnalyzer(env = process.env) {
  // The bundle bravos setup staged wins; then PATH; then the Python install's own copy.
  const home = env.BRAVOS_HOME || (env.HOME ? join(env.HOME, '.bravos') : null);
  if (home) {
    const stagedBin = join(home, 'analyzer', 'current', 'bravos-cli');
    try {
      accessSync(stagedBin, constants.X_OK);
      return realpathSync(stagedBin);
    } catch {
      /* not staged */
    }
  }
  const direct = onPath('bravos-cli', env);
  if (direct) return direct;
  const launcher = pythonBravos(env);
  if (!launcher) return null;
  try {
    const file = join(dirname(dirname(realpathSync(launcher))), 'analyzer', 'bravos-cli');
    accessSync(file, constants.X_OK);
    return file;
  } catch {
    return null;
  }
}

// @comment -- "Where a Bravos licence is, read-only: BRAVOS_LICENCE / BRAVOS_LICENSE, else licence.jwt or license.jwt in $BRAVOS_HOME, ~/.bravos, or ~/.bugb (where bravos still keeps its state until ~/.bravos holds some). Returns a short label for the source, or null."
export function findLicence(env = process.env) {
  if (env.BRAVOS_LICENCE) return 'BRAVOS_LICENCE';
  if (env.BRAVOS_LICENSE) return 'BRAVOS_LICENSE';
  const homes = [env.BRAVOS_HOME, env.HOME && join(env.HOME, '.bravos'), env.HOME && join(env.HOME, '.bugb')].filter(Boolean);
  for (const home of homes) {
    for (const name of ['licence.jwt', 'license.jwt']) {
      if (existsSync(join(home, name))) return home === env.BRAVOS_HOME ? `$BRAVOS_HOME/${name}` : `${home.replace(env.HOME, '~')}/${name}`;
    }
  }
  return null;
}

// @comment -- "Whether SAST can run here at all, read-only: bravos-cli found (findAnalyzer) and a licence that verifies to a paid tier (licence.mjs). On success it names the analyzer's path, which a skill uses when bravos-cli is only inside the bravos install."
export function sastAvailable(env = process.env) {
  const analyzer = findAnalyzer(env);
  if (!analyzer) return { ok: false, missing: 'bravos-cli' };
  // Presence is not enough: the licence must verify and be a paid tier that is not expired.
  const v = licenceStatus(env);
  if (!v.licensed) return { ok: false, missing: 'licence', analyzer, state: v.state };
  return { ok: true, analyzer, licence: v.source };
}

// @comment -- "The one SAST line the briefing and bravos sast status print: the newest run's counts and age, or why there is none (not run here, or unavailable and what is missing)."
export function sastLine(summary, available, licence = null) {
  // An unlicensed machine is told once, by the plan line; here only that SAST is among the locked features.
  if (licence && !licence.licensed && !summary) return 'SAST: on the Team plan (see Plan above); skills carry on without it';
  if (summary) {
    const age = summary.staleCommits === null ? '' : summary.staleCommits === 0 ? ', current' : `, ${summary.staleCommits} commit${summary.staleCommits === 1 ? '' : 's'} old`;
    return `SAST: ${summary.total} findings (${summary.reachable} reachable, ${summary.unjoinedReachable} not in the threat model) at ${summary.sha ? summary.sha.slice(0, 9) : summary.run}${age} — bravos sast candidates`;
  }
  if (available?.ok) return `SAST: not run here — bravos-sast runs it (bravos-cli${available.analyzer && !available.analyzer.endsWith('/bin/bravos-cli') ? ` at ${available.analyzer}` : ''} and a licence are present)`;
  return `SAST: unavailable here — ${available?.missing === 'licence' ? 'the person activates their Bravos licence (bravos account activate)' : 'bravos-sast installs bravos-cli with the person\'s go-ahead (bravos setup)'}; skills carry on without it`;
}
