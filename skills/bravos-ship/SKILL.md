---
name: bravos-ship
description: "The no-mistakes security gate before a pull request: validate the threat model, lint the branch's new claims, fail on new exposure against the base, list undefended paths, annotate the change's gaps, and refuse to ship a confirmed-exploitable claim on a changed path. Use before `gh pr create`, `gh pr ready` or pushing for review, and whenever asked for a pre-PR, pre-merge or pre-push security check."
---
<!-- bravos:generated -->
# Bravos ship: the security gate before a pull request

## When

- You are about to run `gh pr create` or `gh pr ready`, or push a branch for review.
- The user asks for a pre-PR, pre-merge or pre-push security check.
- The user asks to open a PR and has not mentioned the gate: suggest it, then run it.

## Do

**Plan check first.** The pre-PR gate is on the Team plan. Run `bravos licence --json` once per session (the briefing's `Plan:` line says the same); if `licensed` is false, tell the person in two sentences what this skill would do here and that it needs a Team licence — `bravos account activate` starts a 30-day trial with no card, or https://account.bugb.io/pricing — then stop, and do nothing else from this skill. A licence in grace still counts.

1. Find the base. Commit or stash work in progress first; the gate judges `HEAD`. The default branch is `git symbolic-ref -q refs/remotes/origin/HEAD` (strip `refs/remotes/origin/`; if it prints nothing, use `main`). Run `git fetch origin <default>` so the merge-base is current (if the fetch fails, offline or with no `origin`, say so and continue with the local ref), then `<base>` = `git merge-base HEAD origin/<default>`. Every gate below is deterministic and spends no model. Read the effort: the user's words ("at high"), else a `bravos effort: <level>` line in `AGENTS.md` / `CLAUDE.md`, else medium. It sets a starting budget, not a limit; go beyond it when the work needs it and say why in one line. Starting budget — low: the deterministic gates (steps 2–4); medium: also the code-graph gaps; high: also SAST; max: also bravos-recheck on the changed paths.
2. Run `guardlink validate .` and fix what it reports.
3. Run `guardlink lint . --since <base> --json`. This judges every claim on the branch, not only yours. Apply an entry's `fix` only to a line this session wrote, and rerun until `summary.errors` is 0. For `accepts-written`, `entitles-written` or `confirmed-without-evidence` on any other line, do not touch it: stop and report it to the user.
4. Run `guardlink diff <base> --fail-on-new --markdown`. Exit 0 means no new unmitigated exposure. A non-zero exit lists new exposures with no `@mitigates`; an `@exposes` plus `@audit` written on this branch is new exposure and stays listed by design. Do not try to turn it green: report each listed exposure as open in the Security gate section and stop there for that exposure. Fixing the code or accepting the risk is the human's decision.
5. Run `guardlink paths --json` and report how many undefended source-to-sink paths it lists. This is informational in this version and does not block. In a bravos workspace, also read the cross-service edges (`bravos workspace show --json`, `export.edges`) whose `dstMember` is this service and whose target id is declared in a file this branch changed: report them as "callers in other services" in the Security gate section, so the reviewer checks those callers too.
6. If the code graph is present, call `codegraph_annotation_gaps` on the changed files and send each gap to bravos-annotate (diff playbook).
7. Run `guardlink ci -f json`. A `confirmed[]` entry whose `location.file` is in `git diff --name-only <base>...HEAD` blocks the PR unless a `@ticket` line written by a human carries it. Check who wrote the `@ticket` line with the MCP tool `guardlink_blame` on the file, or `git log -L <line>,<line>:<file>`, or ask the user. A code change does not clear it: only a human removes the confirmation after a reproduction shows the exploit no longer works. If it blocks, tell the user the threat, asset and file:line, and do not ship.
8. Rerun steps 2–4 until validate and lint exit 0, and diff exits 0 or every new exposure it lists is reported as open.
9. If the repo has `.guardlink/report.json`, refresh it with `guardlink parse . -o .guardlink/report.json` and include it in the change.
10. Run bravos-sast now if `bravos-cli` and its licence are present (its report goes to `.bravos/sast/<run>/`, read with `bravos sast candidates`); otherwise note in the gate section that SAST is unavailable and was not run.
11. Write the "Security gate" section:
    validate ✔ · lint 0 errors · diff: no new exposure (or: <k> new exposures open, each listed as `#<threat> on #<asset>`) · undefended paths <n> · confirmed on changed paths <k>
    states: <n> open / <m> mitigated · untested <u> / confirmed <k> · stale <s> (guardlink ci)
    Not tested: <what no tool exercised, e.g. no live run, SAST not run>
    If the user asked for a PR, open it with this section in the body; otherwise print the section and stop.
12. When the opt-in pre-PR hook is installed (`bravos init --pre-pr-hook`), it reruns these gates on `gh pr create` and `gh pr ready` and blocks on lint errors, on a new exposure whose threat and asset ids are not both named in the PR body, on a confirmed claim on a changed file with no `@ticket` for it in that file, and on any gate that fails to run (unknown); let it run. Before the PR exists, `bravos hook pre-pr --check` runs the same gates by hand and lists the new exposures the body must disclose.

## Never

- Write `@accepts` to clear a finding, or write a `@ticket` line on the human's behalf.
- Write a `@mitigates` whose control you did not verify in the code, to make `diff` pass.
- Remove or edit a `@confirmed` line; never treat a code change as clearing one.
- Apply a lint `fix` to a line this session did not write. For `accepts-written`, `entitles-written` or `confirmed-without-evidence` on someone else's line, never remove or downgrade it: stop and report it.
- Call the PR clean, secure or safe unless every gate exited 0, and even then say what was not tested.
- Skip the confirmed check in step 7.
- Bypass, disable or work around the pre-PR hook.

## Done when

- On the final `HEAD`, `guardlink validate .` and `guardlink lint . --since <base> --json` (0 errors) exit 0, and `guardlink diff <base> --fail-on-new --markdown` exits 0 or every new exposure it lists is reported to the user as open.
- No `confirmed[]` entry sits on a changed file without a human-written `@ticket`, or you told the user the PR is blocked.
- The "Security gate" section reports the three states honestly: exposures open vs mitigated (none accepted by you), untested vs confirmed vs refuted per `guardlink ci`, verified vs stale. It names the tool behind each line and has a "Not tested" line.

## What it leaves for the next skill

- The Security gate section (in the PR body if one was asked for), the open exposures for the human to decide on, and the undefended-path count for the next bravos-annotate round.

## Go deeper

- `docs/GUARDLINK_REFERENCE.md` — verbs, including `@ticket`.
- `.guardlink/README.md` — placement rules for this repo.
- `.claude/skills/guardlink-annotate-diff/SKILL.md` — the playbook for a change's gaps; `.claude/skills/guardlink-annotate-exploitable/SKILL.md` for the evidence bar. guardlink writes both under `.claude/skills/`, and `bravos init` mirrors them into `.agents/skills/` for Codex; otherwise `guardlink annotate --stdout --playbook <id> "<scope>"` prints the same method.
