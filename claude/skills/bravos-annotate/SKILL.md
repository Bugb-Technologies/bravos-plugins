---
name: bravos-annotate
description: "Keep the GuardLink threat model correct and growing, in this session: pick a budgeted slice of files (or go deep on request), follow guardlink's own playbook skill, write annotations that meet the evidence bar, run the lint gate until clean, and report the coverage delta. Use when asked to annotate, threat-model or cover code, after writing security-relevant code, when the briefing shows coverage or a worklist, and when asked to annotate deeply or run multiple rounds."
---
<!-- bravos:generated -->
# Bravos annotate: a budgeted slice of the threat model, gated

## When

- The user asks to annotate, threat-model or cover code, or to go deep / run several rounds.
- You just wrote or changed security-relevant code and its claims are missing or stale.
- The briefing's `Open exposures:` line shows low coverage or a non-empty worklist.
- bravos-ship or bravos-codegraph handed you gaps to annotate.

## Do

1. Set up. You annotate in this session: guardlink supplies the method (its playbook skills), you supply the edits. `<base>` below is the base branch name, e.g. `main`; the briefing prints it as `base origin/<base>`, and without a briefing `git symbolic-ref -q --short refs/remotes/origin/HEAD` prints `origin/<base>` (if it prints nothing, use `main`). Run `git fetch origin <base>` before you use `origin/<base>`, so it is current; if the fetch fails (offline, no `origin`), say so and continue with the local ref. Record `git rev-parse HEAD` now as `<start>`: the lint gate judges only what this session writes. Definitions (`@asset`, `@threat`, `@control` with `#id`) live in `.guardlink/definitions.*`; reuse those ids and never redefine one. Read `.guardlink/intent.md`: its invariants (`INV-n`), intended-by-design items (`INT-n`), actors and crown jewels shape every claim below. If it is missing, run bravos-context first; if the user declines, carry on and tell them severities are not calibrated to the product.
2. Run `guardlink ci -f json`. Note `summary.coverage.percent` as p0 and the worklist size from the briefing or `guardlink unannotated --json` (`summary.worklist`).
3. Read the effort: the user's words ("at high"), else a `bravos effort: <level>` line in `AGENTS.md` / `CLAUDE.md`, else medium. Starting budgets — low: the changed files only; medium: changed plus 5 from the worklist; high: 25 per round, then the `chains` playbook; max: rounds until the worklist is empty (bravos-campaign runs those with subagents). These are defaults, not limits: take more or fewer when the code calls for it, and say why in one line ("12 files, not 5: the auth path spans them"). For a large pick, tell the user the files and rounds before you start.
4. Run `node ${CLAUDE_SKILL_DIR}/scripts/slice.mjs --base origin/<base> --n <budget>` (`--deep` for no limit, `--batches <k>` to split the pick for parallel work, `--prefer <file>` for entry points `codegraph_entry_points` found). It prints one JSON object: `diff` (changed files), `coverage` (unannotated files to cover, entry points and trust code first, generated, test and CI files last), `coverage_detail` (`{path, tier, why}`), `batches`, `skipped` (`{path, reason}`), `coverage_before`, `notes`. The order is advice: if your reading of the code says a different file matters more, take it and say why. Tell the user which `skipped` files teammates have in flight. Report every `notes` entry to the user; if one says gh was unavailable, say in-flight PRs were not checked before you take the `coverage` files. Exit 1 means `guardlink unannotated --json` failed: report it and stop. When the briefing's `SAST:` line shows a run, `bravos sast candidates` lists reachable findings not in the threat model yet: add their files to the pick as leads, open each, and annotate only what meets the evidence bar, as `@exposes` + `@audit` citing the rule and route, or an `@audit` naming a false positive. A static finding is never `@confirmed`. With SAST unavailable or no report, pick as usual.
5. Pick the playbook: `diff` files → `diff`; `coverage` files → `coverage`. Deep rounds run `exploitable`, then `chains`, then `coverage`, then `verify`. Add a logic pass when intent.md lists invariants (always at high and max, or when guardlink offers a `logic` playbook use it): walk each user journey that touches an invariant — signup, invite, role change, checkout, refund, export — and at each step ask what it assumes about the caller and the step before: ownership, tenant, state, amount, rate. The sink of a logic claim is the state change (the write, the transfer, the grant); the absent control is the missing ownership or state check. Claim it against the invariant's threat: `@mitigates <Asset> against #inv-… using #<control>` for a check that holds, `@exposes <Asset> to #inv-…` for one that is missing and meets the evidence bar, `@audit` for a doubt.
6. Open `.claude/skills/guardlink-annotate-<id>/SKILL.md` (guardlink writes it under `.claude/skills/`, and `bravos init` mirrors it into `.agents/skills/` for Codex) and follow it. Otherwise call the MCP tool `guardlink_annotate` (server `guardlink`) with `prompt: "<scope>"` and `playbook: "<id>"`, or run `guardlink annotate --stdout --playbook <id> "<scope>"` (for the `diff` playbook, `guardlink annotate --stdout --playbook diff --since origin/<base> "<scope>"`, since `--since` defaults to HEAD and would list no changed files), and follow the prompt it returns.
7. Write the annotations in each file's own comment syntax, directly above the code they describe, coupled: every `@exposes` with its `@mitigates` or `@audit`, the `@flows` the data takes, and a `@comment` on what the code does. Each claim meets the evidence bar: it names the code, the threat and the control by id, and you could point at the line that makes it true.
   Rate each `@exposes` by impact × reach × ease, within its threat's band, under intent.md's `## Assumptions` when it has them (the configuration baseline, deployment and attackers in scope; an exposure only an out-of-scope attacker reaches gets an `@audit`, not a severity): impact from the asset's `@handles` class and intent.md's crown jewels; reach from the boundary in front of it (public, then signed-in, then admin-only, then internal; with the code graph (its MCP tools, or `bravos graph <question> --json` — same answers; see bravos-codegraph), `codegraph_auth_boundary` for the route and `codegraph_reachable_sinks` for what the handler reaches; code `codegraph_entry_reach` or `codegraph_dead_code` shows no entry point reaches gets an `@audit` "not reachable per code graph", not a severity; without the graph, judge reach by reading the code and say the graph was unavailable); ease from its preconditions. Write the severity inline and the reason in the description ("high: reachable unauthenticated, touches payment records").
   Intended? When the code does what an intent.md `INT-n` item says the product does on purpose, write no `@exposes`: write an `@audit` citing it ("by design per intent.md INT-2; check only admins reach it") and annotate the guard that should hold. When it looks intended but intent.md is silent, write an `@audit` asking "intended?" with your reason, and list it for the user. They answer with a fix, an intent.md line or their own `@accepts`; you never accept it. In a bravos workspace (the briefing's `Workspace:` line, or `.bravos/workspace/workspace.json`), define only this service's own assets, with ids prefixed by the service (`#orders-create`), never another service's; declare each call to another service as `@flows #<this>-<x> -> #<other>-<y> via http|grpc|queue -- "..."` with the other service's own id. Do not write the dotted `#repo.tag` form that guardlink's Workspace Context block suggests: cxg cannot chain it, so the cross-service attack is never tested.
8. Gate: run `guardlink lint . --since <start> --json`. For each entry in `violations[]`, apply its `fix`. Repeat until `summary.errors` is 0. A violation on a line you did not write this session is not yours: leave the line as it is and report it to the user.
9. Run `guardlink validate .` and fix what it reports in the lines you wrote.
10. Run `guardlink ci -f json` again and report `+<files>, <p0>% → <p1>%, <errors> lint errors`. Deep only: repeat steps 4–10 once per round, and stop when `coverage` comes back empty or a round adds no claims.
11. Commit the slice on its own: `git add` only the annotated files, message `annotate: <n> files, <playbook>`. Ship it as a small PR or on the feature branch, whichever the team does.
12. Hand the new claims to bravos-ship, and the new `@exposes` ids to bravos-templatize so they become testable.

## Never

- Run `guardlink annotate` with an agent flag. Use `--stdout` and do the work here.
- Write `@accepts`, `@entitles` or `@confirmed`.
- Apply a lint `fix` to a line this session did not write. For `accepts-written`, `entitles-written` or `confirmed-without-evidence` on someone else's line, never remove or downgrade it: stop and report it to the user.
- Edit or delete an existing claim. If one looks wrong, write an `@audit` beside it saying why.
- Treat an intended-by-design match as an accepted risk, or drop an existing claim because intent.md covers it.
- Annotate a file `guardlink unannotated` lists under `excluded`.
- Pad coverage with claims that fail the evidence bar. An honest `@exposes` plus `@audit` beats a guessed `@mitigates`.

## Done when

- `guardlink lint . --since <start> --json` reports `summary.errors` 0 and `guardlink validate .` exits 0.
- You reported the delta line from step 10, the files left in `skipped`, and any lint violation on a line you did not write.
- Each new `@exposes` carries a severity with its reason, and every "intended?" `@audit` is listed for the user.
- Each new claim's state is clear: open or mitigated (none accepted by you), untested (an annotation alone confirms or refutes nothing), and verified or stale per `guardlink ci`. Say what was not tested. Do not call the code clean; the lint gate judges annotations, not code.

## What it leaves for the next skill

- One commit of annotated files and the list of new `@exposes` ids and files, for bravos-ship.

## Go deeper

- `.claude/skills/guardlink-annotate-exploitable/SKILL.md` — the evidence bar (guardlink writes it under `.claude/skills/`, and `bravos init` mirrors it into `.agents/skills/` for Codex; otherwise `guardlink annotate --stdout --playbook exploitable "<scope>"` prints the same method).
- `docs/GUARDLINK_REFERENCE.md` — verbs and syntax.
- `.guardlink/README.md` — placement rules for this repo.
