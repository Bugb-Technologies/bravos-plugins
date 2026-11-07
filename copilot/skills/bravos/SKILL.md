---
name: bravos
description: "Start here in any repo bravos is installed in: reads the security picture, explains the evidence loop in five lines, and routes to bravos-annotate, bravos-codegraph or bravos-ship. Use when asked where to start on security, what is open or confirmed, what to fix next, or whenever a task touches security-relevant code."
---
<!-- bravos:generated -->
# Bravos: where this repo stands and what to do next

## When

- The user asks where to start on security, what is open, what is confirmed exploitable, or what to fix next.
- A task touches security-relevant code: endpoints, authn/authz, validation, queries, file I/O, external calls, crypto, process spawning, config parsing.
- You are about to pick one of the other bravos skills and are not sure which.
- The user is new or asks how to get started: "help me get started", "what can bravos do here?", "I'm new", or runs this skill with no task.

## Do

1. If the user is new or asks how to start, give the guided start and stop there: read the briefing's `Setup n/9` line (or run `bravos next --json`); say in three sentences what bravos does here; show what is on and the next step with its exact command and what it unlocks; offer three things to try now that fit the repo, in setup order — the code graph comes first because every later step reads it (graph off → build it with `bravos graph build . --scip no-exec`; intent none → learn what the app intends; low coverage → annotate the top files; then SAST, which reads the annotations; untested exposures → prove the top 3; a branch with changes → the ship check), in plain words with the skill named second; point to `bravos guide roles`, and mention once that `bravos watch` in a second terminal pane shows all of this live while they work. Run a setup command that changes config or hooks only after the person agrees. Otherwise read the session-start briefing. It opens with `GuardLink security picture (bravos) — <repo> @ <sha>, base <base>`. If none is in context (a harness that ran no hook), run `bravos hook session-start --briefing` once: it prints the briefing as plain text. Pull out: the `Open exposures:` line (severity counts, coverage, worklist), `FIX NOW — confirmed exploitable`, `Next to test or fix (guardlink hypothesis next)`, `Went stale in files you changed since <base>`, `Open tickets`, `In flight by teammates`, the `Code graph:` state, and the `Intent:` line (none or draft means severities are not yet calibrated to the product; offer bravos-context). `Open exposures: unknown (guardlink ci unavailable)` means the picture is unknown, not empty. bravos keeps no state of its own (`.bravos/` holds only the hook and the skills lock); when the briefing says a tool is unavailable, `bravos doctor` reports which tools are present. When the briefing has a `Workspace:` line, this repo is one service of a larger app: changes belong in the service's own repo, questions across services go to the app folder it names, and `bravos workspace show` lists the services, their URLs and the calls between them.
2. Explain the evidence loop in five lines when the user is new to it or asks what a finding means:
   claim (an annotation says code is exposed or mitigated) → testable template → authorized run against a target the user owns → verified outcome → recheck when the code changes.
   Three states are independent of each other: open / mitigated / accepted · untested / confirmed / refuted · verified / stale. A mitigated claim can still be untested; a confirmed one can go stale.
3. Route the request:
   no `.guardlink/intent.md` yet, business logic, "what matters here", "is this intended?", learning the app → bravos-context (run it before a first annotation pass).
   coverage, annotating, "threat-model this", a worklist in the briefing → bravos-annotate.
   reachability, blast radius, "is this live", tracing a handler to sinks → bravos-codegraph.
   before a PR, push for review, or marking a draft ready → bravos-ship.
   pentest templates, a retest kit, making a claim testable → bravos-templatize.
   standing up a test target, seeding test users, capturing a session → bravos-env.
   proving a finding, testing whether an exposure is exploitable → bravos-prove (after bravos-env).
   a fix landed, stale claims, closing a security ticket → bravos-recheck.
   write up the assessment, a finding, a retest or a brief for leadership → bravos-report.
   static analysis, dependency, secret or IaC findings → bravos-sast; "what did SAST find" → `bravos sast candidates` (the briefing's `SAST:` line says whether a run exists, or that SAST is unavailable).
   keep annotating while I work, nightly or periodic runs → bravos-schedule.
   security CI, a PR check, code-scanning upload → bravos-cicd.
   reach a goal over many rounds ("100% coverage", "test every exposure", "until done", autopilot, a campaign) → bravos-campaign.
   The briefing's `Plan:` line says which tier this machine is on. On Free, the research loop (context, annotate, templatize, env, prove, recheck, report, watch) is all there; the pre-PR gate, CI and nightly, schedule, workspaces, campaign, SAST and the code graph are on Team. When the request needs one of those, still name the right skill, say in one sentence that it is on the Team plan (`bravos account activate` starts a 30-day trial, no card), and offer the nearest free step instead; never pretend the feature ran.
4. bravos adds method and memory to what you can already do; it never caps it. Budgets in the skills are defaults: exceed them when the work calls for it and say why. Effort (low, medium, high, max) comes from the user's words, else a `bravos effort: <level>` line in `AGENTS.md` / `CLAUDE.md`, else medium. Only the safety rules under each skill's Never are hard.
5. Name the next step in one line, taken from the briefing: a `FIX NOW` item first, then a stale claim in a file the user changed, then the top `guardlink hypothesis next` item, then coverage.
6. When the user takes an item to work on and it already has a ticket in their tracker, record the pick-up beside its claim so the hive can see it: write `@ticket #<threat> on #<asset> <ticket-ref> sla "<label>" by <assignee> until <YYYY-MM-DD>` directly beside the claim's `@exposes`, clauses in that order, dropping `sla "<label>"` and `until <YYYY-MM-DD>` unless the user gives them, then run `guardlink validate .`. The briefing's `Open tickets` line and `guardlink lookup tickets` show it to teammates; removing the line is how the ticket leaves the model.

## Never

- Run a setup command for the person (bravos sync --autopilot, --ci, --pre-pr-hook, bravos setup, bravos graph build with --scip auto) without their go-ahead.
- Run `guardlink annotate` or guardlink translate with an agent flag. Those launch a second agent outside this session; you are the agent, so do the work here.
- Write `@accepts`, `@entitles` or `@confirmed`. Acceptance and entitlement are a human's decision; confirmation needs a reproduced run, and reading code is not one.
- Call anything clean, safe or fixed unless a gate said so with exit 0.
- Invent a ticket id, SLA, assignee or due date; take each from the user or their tracker.

## Done when

- The user knows the three states for what you reported: open vs mitigated or accepted, untested vs confirmed vs refuted, verified vs stale.
- Every finding you mention names the tool that judged it (guardlink ci, the code graph, a cxg run) and what was not tested.
- You named one next step and the skill that owns it.

## What it leaves for the next skill

- The briefing lines you quoted and the one next step, so the routed skill starts from the same picture.

## Go deeper

- Autopilot (`bravos init --autopilot`): an end-of-turn check sends you back once when changed code lacks annotations, sits under a confirmed or stale claim, or adds exposures; the briefing's `Autopilot:` and `Proving:` lines say whether it is on and how the person wants proving handled.
- `bravos guide` (in a shell; no model) explains bravos by role, by task and skill by skill, with the safety rules; `docs/GUIDE.md` in the bravos package is the same text. Point a person there when they ask how to use bravos.
- `docs/GUARDLINK_REFERENCE.md` — annotation syntax and verbs.
- `.guardlink/README.md` — where annotations go in this repo.
- `.claude/skills/guardlink-annotate-exploitable/SKILL.md` — the evidence bar a claim must meet (written by `guardlink init --agent claude` under `.claude/skills/` when present; otherwise `guardlink annotate --stdout --playbook exploitable "<scope>"` prints the same method).
