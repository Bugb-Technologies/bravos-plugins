// @comment -- "bravos's setup score: which of the nine capabilities are switched on in this repo (intent, coverage, autopilot, pre-PR gate, code graph, proving preference, test target, CI, SAST), what each unlocks, how to switch it on in the harness's own words, and the next one to unlock. Pure over inputs collect() already gathered plus two file checks; read-only, no model."
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const SETUP_SCHEMA = 'bravos.setup/v1';
const SIGIL = { claude: '/', codex: '$', omp: '/skill:', opencode: '/' };

/** A skill the person can invoke: /bravos-x, $bravos-x, /skill:bravos-x, or "the bravos-x skill" elsewhere. */
const skill = (name, harness) => (SIGIL[harness] ? `${SIGIL[harness]}${name}` : `the ${name} skill`);

// @comment -- "Builds the nine setup items in dependency order: the code graph first (a machine step every later skill reads), then intent (people), coverage (annotate reads intent and the graph), SAST (reads the annotations), how findings are proven and a test target (needed to test), then the gates (autopilot, pre-PR, CI). Each has its done-state, what it unlocks and how, with skills in the harness syntax. bravos assumes a licensed bravos-cli, so a missing one is a to-do, not 'not available'."
export function readSetup(root, i = {}, harness = 'other') {
  const coverage = Number(i.guardlink?.ci?.summary?.coverage?.percent);
  const items = [
    {
      id: 'graph',
      on: i.codegraph === 'current' || i.codegraph === 'unknown' || i.codegraph === 'cli',
      label: i.codegraph === 'not-built' ? 'rebuild the code graph for this commit' : 'build the code graph',
      cta: `say "build the code graph"`,
      unlocks: 'every later step reads it: real routes for intent, reach for annotate, call paths for templates, callers for rechecks',
      how: `${i.codegraph === 'not-built' ? 'bravos has no graph for this commit (it keys a graph to the commit it was built at); ' : ''}ask "build the code graph" (${skill('bravos-codegraph', harness)}): the agent builds it with bravos graph build . --scip no-exec (no tokens, a few minutes; bravos setup first if bravos is missing, with your go-ahead) and asks it through bravos graph, no reconnect needed`,
    },
    {
      id: 'intent',
      on: i.intent?.status && i.intent.status !== 'none',
      label: 'record what the app intends',
      cta: skill('bravos-context', harness),
      unlocks: 'severities judged against what the software is meant to do and which attackers are in scope',
      how: `ask "learn what this app intends" (${skill('bravos-context', harness)})`,
    },
    {
      id: 'coverage',
      on: Number.isFinite(coverage) && coverage >= 80,
      label: `cover the code${Number.isFinite(coverage) ? ` (now ${coverage}%)` : ''}`,
      cta: skill('bravos-annotate', harness),
      unlocks: 'the agent sees the security facts of the files it touches; SAST reads them',
      how: `ask "annotate the uncovered files" (${skill('bravos-annotate', harness)}, or ${skill('bravos-campaign', harness)} for all of it)`,
    },
    {
      id: 'sast',
      on: !!i.sast?.summary,
      label: 'run SAST',
      cta: skill('bravos-sast', harness),
      unlocks: 'dependency CVEs, secrets and request-to-sink taint feed annotate, templatize and prove',
      how: i.sast?.available?.ok ? `ask "run SAST" (${skill('bravos-sast', harness)}), after annotating so it reads the threat model` : `ask "set up SAST" (${skill('bravos-sast', harness)}): the agent installs bravos-cli with your go-ahead (bravos setup); activate your licence with bravos account activate`,
    },
    {
      id: 'proving',
      on: i.proving?.status === 'set',
      label: 'choose how findings are proven',
      cta: 'say "prove the top 3"',
      unlocks: '"prove the top 3" runs the way the team chose, without asking each time',
      how: `ask "prove the top 3 threats" — the agent asks once how you want proving handled (${skill('bravos-prove', harness)})`,
    },
    {
      id: 'target',
      on: existsSync(join(root, '.guardlink', 'scope.yaml')) || !!i.proving?.target,
      label: 'set up a test target',
      cta: skill('bravos-env', harness),
      unlocks: 'exposures can be tested for real instead of argued about',
      how: `ask "bring up a test target" (${skill('bravos-env', harness)}); bravos sync --scope writes the loopback-only starter`,
    },
    {
      id: 'autopilot',
      on: !!i.autopilot,
      label: 'turn on autopilot',
      cta: 'bravos sync --autopilot',
      unlocks: 'annotations and rechecks happen at the end of each turn without being asked',
      how: 'bravos sync --autopilot (cheap; fine to switch on early)',
    },
    {
      id: 'prepr',
      on: !!i.prePr,
      label: 'turn on the pre-PR gate',
      cta: 'bravos sync --pre-pr-hook',
      unlocks: 'no pull request goes out with undisclosed exposure or a confirmed exploit',
      how: 'bravos sync --pre-pr-hook (autopilot turns it on too)',
    },
    {
      id: 'ci',
      on: existsSync(join(root, '.github', 'workflows', 'bravos-pr-gate.yml')),
      label: 'add the CI gate and nightly',
      cta: 'bravos sync --ci',
      unlocks: 'the whole team is gated, and upkeep runs while laptops are closed',
      how: 'bravos sync --ci, then commit .github/workflows/',
    },
  ].map((x) => ({ ...x, on: !!x.on }));
  // Paid steps on an unlicensed machine say so in their `how` and are never the next step: the score
  // counts what the person can do today, and the plan line (briefing, doctor, watch) says how to change it.
  const licensed = !!i.licence?.licensed;
  const paid = { sast: 'SAST', autopilot: 'autopilot', prepr: 'the pre-PR gate', ci: 'the CI gate and nightly' };
  for (const x of items) {
    if (!licensed && x.id in paid && !x.on) {
      x.paid = true;
      x.how = `${paid[x.id]} is on the Team plan: bravos account activate starts a 30-day trial (no card), then ${x.cta}`;
    }
  }
  const done = items.filter((x) => x.on).length;
  const next = items.find((x) => !x.on && !x.paid) ?? items.find((x) => !x.on) ?? null;
  return { schema: SETUP_SCHEMA, done, total: items.length, items, next, plan: i.licence ? { licensed, state: i.licence.state, tier: i.licence.tier } : null };
}

/** The one Setup line the briefing gives the agent and the banner shows the person. */
export function setupLine(s) {
  if (!s) return null;
  return s.next ? `Setup ${s.done}/${s.total} — next: ${s.next.label} (${s.next.unlocks}): ${s.next.how}` : `Setup ${s.done}/${s.total} — everything bravos can use here is on`;
}
