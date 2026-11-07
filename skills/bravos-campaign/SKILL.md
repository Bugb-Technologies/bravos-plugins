---
name: bravos-campaign
description: "Reach a security goal over many rounds and then stop: annotation coverage to a target, every open exposure tested on loopback, or every stale claim rechecked. Plans disjoint batches, runs one subagent per batch each round, gates every batch, rests between rounds with the harness's own loop or wakeup, and reports before-and-after numbers. Use when asked to reach 100% coverage, annotate or test everything, run until done, go on autopilot, or loop and schedule rounds with rests."
---
<!-- bravos:generated -->

> Paths that start with `SKILL_DIR/` are files in this skill's own folder, the folder that holds this SKILL.md.
# Bravos campaign: rounds toward a goal, gated, then stop

## When

- The user names a goal larger than one session's slice: "coverage 100%", "test every open exposure", "recheck everything", "until done", "autopilot".
- The user asks for rounds, batches, subagents per round, or a rest between rounds.
- The briefing shows a large worklist or many untested exposures and the user wants it cleared.

## Do

**Plan check first.** Campaigns are on the Team plan. Run `bravos licence --json` once per session (the briefing's `Plan:` line says the same); if `licensed` is false, tell the person in two sentences what this skill would do here and that it needs a Team licence — `bravos account activate` starts a 30-day trial with no card, or https://account.bugb.io/pricing — then stop, and do nothing else from this skill. A licence in grace still counts.

1. Read the goal, the effort, the rest interval and any spend cap from the request. Goals: `coverage <N>%` (annotate), `test` (templatize, then env, then prove, loopback only), `recheck`, or several in that order. Effort: the user's words, else a `bravos effort: <level>` line in `AGENTS.md` / `CLAUDE.md`, else high (a campaign is a big job). Rest: the user's interval, else 10 minutes. If `.guardlink/intent.md` is missing, run bravos-context first and ask its questions once, before any round.
2. Read where things stand: `guardlink ci -f json` (`summary.coverage`, `exposures[]`, `stale[]`) and `guardlink hypothesis next --json`. If the goal is already met, say so and stop.
3. Estimate and say it before the first round: files or exposures left, batch size and batches per round (default 5 × 3, a starting point, not a limit; at max, as many batches as the work splits into cleanly), rounds expected, and that every round spends model tokens. At max this is information; below max, wait for the user's go-ahead once.
4. Plan the round's batches: `node SKILL_DIR/../bravos-annotate/scripts/slice.mjs --base origin/<base> --n <size> --batches <k>` gives disjoint `batches`, entry points first, generated, test and CI files last. For `test` and `recheck`, split the exposures or claims the same way, one directory per batch. Reorder by your own reading of the code when it disagrees, and say why.
5. Run the round: one subagent per batch, through the harness's own subagent tool (in Claude Code the Agent tool; in Codex its subagents if this session has them, otherwise the batches one after another here). Brief each with its batch only, the skill to follow (bravos-annotate, bravos-templatize, bravos-prove or bravos-recheck), the effort, and the `<start>` commit. Each subagent runs that skill's gate to 0 errors and commits its batch alone.
6. Check the round here: `guardlink validate .`, then `guardlink ci -f json`. Report per batch and in total: files or exposures done, coverage before and after, gate errors, anything a subagent left. A batch whose gate failed is not committed; give it back to the next round once, then report it.
7. Rest, then start the next round at step 2. In Claude Code, schedule the next round after the rest interval with the session's wakeup or self-paced loop tool, passing this campaign's goal; if none is available, tell the user to run `/loop` with the campaign prompt. In Codex there is no in-session timer: run the next round straight away, or hand the campaign to the nightly workflow (bravos-schedule). Say which you did.
8. Stop when the goal is met, a round adds nothing, the same batch fails its gate twice, or the spend cap is reached. Final report: before and after numbers, commits per round, what is left and why, and the three states (open / mitigated, untested / confirmed / refuted, verified / stale) for what changed.

## Never

- Give two subagents overlapping files, or let one write outside its batch.
- Commit a batch whose gate failed, or carry on past a goal that is already met.
- Run a live test against anything but loopback, unless the host is in a committed, reviewed `scope.yaml` and the human typed their authorization in this session; never use `--destructive-ok` in a campaign.
- Launch an external agent CLI (a guardlink or cxg agent flag) for a batch; subagents come from the harness this session runs in.
- Open or update a pull request, or push, unless the user asked for it.
- Write `@accepts`, `@entitles` or `@confirmed`.

## Done when

- The goal is met, or the stop rule fired and you said which one.
- Every committed batch passed its gate; every skipped or failed batch is listed with its reason.
- The user has before and after numbers, the commits per round, and what was not tested.

## What it leaves for the next skill

- The campaign's commits on the current branch and the list of what is left, for bravos-ship before a pull request.

## Go deeper

- `SKILL_DIR/../bravos-annotate/SKILL.md` — what each annotation batch does and its gate.
- `SKILL_DIR/../bravos-prove/SKILL.md` — the authorized run a `test` batch makes.
- `SKILL_DIR/../bravos-schedule/SKILL.md` — the nightly option when no in-session timer exists.
