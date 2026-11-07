---
name: bravos-schedule
description: "Set up recurring security upkeep with each harness's own mechanism: an in-session /loop driven by a committed .claude/loop.md while the user works, the nightly GitHub Actions workflow for work while the laptop is closed, or a Claude Code cloud scheduled task the user creates. The nightly can also replay retest kits against a target the committed, reviewed scope authorizes; loops never test. Use when asked to keep annotating while I work, run something nightly or on a schedule, or check the threat model periodically."
---
<!-- bravos:generated -->
# Bravos schedule: recurring upkeep, on the harness's own clock

## When

- The user asks to keep annotating or checking while they work.
- The user asks for nightly, overnight, weekly or periodic security work.
- The team wants the worklist to shrink without spending interactive sessions on it.

## Do

**Plan check first.** Scheduled upkeep is on the Team plan. Run `bravos licence --json` once per session (the briefing's `Plan:` line says the same); if `licensed` is false, tell the person in two sentences what this skill would do here and that it needs a Team licence — `bravos account activate` starts a 30-day trial with no card, or https://account.bugb.io/pricing — then stop, and do nothing else from this skill. A licence in grace still counts.

1. If the user wants a goal reached in rounds with rests ("100% coverage", "every exposure", subagents per round), that is bravos-campaign; hand it over. Otherwise map the intent to one mechanism and say which: while this session is open → an in-session loop; while the laptop is closed, any harness → the nightly GitHub Actions workflow; while the laptop is closed, Claude Code with a cloud account → a cloud scheduled task the user creates.
2. In-session loop (Claude Code only): copy `${CLAUDE_SKILL_DIR}/loop.md` to `.claude/loop.md`, adjust the steps to the user's request, and commit it. Tell the user to start it with a bare `/loop`, which reads that file; it runs only while the session is open, stops when it exits, and expires after seven days. Codex has no equivalent; offer the nightly workflow instead.
3. Nightly workflow: run `bravos init --ci` (or `bravos sync --ci` in a repo bravos already set up), keep the variant for the team's harness (`bravos-nightly-claude.yml` or `bravos-nightly-codex.yml`) and delete the other. Tell the user the secret it needs (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) and to allow GitHub Actions to create pull requests in the repo settings.
4. Cloud scheduled task: a skill cannot create one. Give the user the prompt to paste into `/schedule`: follow bravos-annotate in slice mode on the next unannotated files, run its lint gate, and open one pull request whose body carries bravos-ship's Security gate section. Tell them the task clones the default branch and runs at most hourly.
5. State the spend before the user starts any of them: files per run (the default slice is five) times runs per day, and that each run spends model tokens.
6. Nightly scan, opt-in: it replays the kits in `.guardlink/cxg-replay/` and records outcomes through `guardlink hypothesis confirm --from-scan`, and it runs only when `.guardlink/scope.yaml` is committed with an `authorization_attestation` a human typed and reviewed in a PR, and the repo variable `BRAVOS_SCAN_TARGET` is a loopback URL the job starts (repo variable `BRAVOS_APP_START`) or a host in that scope's `host_allowlist`. Otherwise the step prints why it skipped. Tell the user which variables to set and that the scope file is their standing authorization.

## Never

- Create, enable or change a schedule the user did not ask for, or at a faster cadence than they agreed.
- Schedule a live test from a loop, or add a nightly scan the user did not ask for. The nightly scan never generates probes, never uses `--destructive-ok`, and never runs without the committed scope's human-written attestation.
- Write an API key, token or session into a file or a workflow; secrets live in the repo's secret store.
- Let a loop push, open a pull request, or write `@accepts`, `@entitles` or `@confirmed`.

## Done when

- The user knows which mechanism was set up, how to start or stop it, what it spends, and when it expires.
- `.claude/loop.md` or the workflow file is committed, and any secret it needs is named but not written.
- You said whether the nightly scan is on, what authorizes it, and that loops never test.

## What it leaves for the next skill

- The loop file or workflow path, and the secrets and settings the user still has to add, for bravos-cicd.

## Go deeper

- `${CLAUDE_SKILL_DIR}/loop.md` — the default iteration for a bare `/loop`.
- `${CLAUDE_PLUGIN_ROOT}/skills/bravos-cicd/SKILL.md` — the workflows themselves.
