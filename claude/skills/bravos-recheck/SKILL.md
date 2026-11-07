---
name: bravos-recheck
description: "Keep findings from going stale after code changes: list the claims a change made stale, re-read and re-verify them, replay the retest kits of confirmed threats against an authorized target, check the fix added no new exposure, and re-read what to test next. Use after a security fix lands, when the briefing lists stale claims, when asked whether a fix held, and before closing a security ticket."
---
<!-- bravos:generated -->
# Bravos recheck: a fix is not done until the claim is current

## When

- A fix for a confirmed or open exposure has been written.
- The briefing's `Went stale in files you changed since <base>` line is not empty.
- The user asks whether a fix held, or wants to close a security ticket.

## Do

1. Find the base: `git symbolic-ref -q --short refs/remotes/origin/HEAD` prints `origin/<base>` (if empty, use `main`), then `git merge-base HEAD origin/<base>`. Read the effort: the user's words ("at high"), else a `bravos effort: <level>` line in `AGENTS.md` / `CLAUDE.md`, else medium. It sets a starting budget, not a limit; go beyond it when the work needs it and say why in one line. Starting budget — low: stale claims in the change only; medium: also confirmed threats on changed files; high: every confirmed threat; max: everything, then send annotation gaps to bravos-annotate.
2. List what went stale: run `guardlink ci -f json` and take each `stale[]` entry whose file is in `git diff --name-only <base>...HEAD`. Then widen it past the changed files. With the code graph (its MCP tools, or `bravos graph <question> --json` — same answers; see bravos-codegraph) (briefing `Code graph:` says `current`; rebuild with `no-exec` when `diverged`): `codegraph_impact` on each changed symbol, and `codegraph_callers` where a control moved, give the code whose path runs through the change; add the claims in those files to the list. A fix that removes the only route to a sink (`codegraph_entry_reach` now says unreachable) is a reason to replay its kit and refute it with a run, never a refutation by itself. Read `verdict` and `confidence` first. Without the graph, say "code graph unavailable; rechecking the changed files only". When SAST is available and a run exists, rerun it on the changed files (bravos-sast, `--scope <file>` for each) and compare with `bravos-cli diff <new>.json <old>.json`: a finding that is gone is a reason to replay its kit and refute it with a run, never a refutation by itself. With SAST unavailable, say so and skip it.
3. For each stale claim, re-read the code beneath it and decide whether the claim still says what the code does. If it does not, fix the annotation in this session with bravos-annotate's rules (write an `@audit` beside a claim you did not write rather than editing it).
4. Re-lock only the claims you re-read and still hold: preview with `guardlink verify <file:line> --dry-run`, then run `guardlink verify <file:line>`. Never re-lock a claim you did not read.
5. List confirmed threats on the changed files: `guardlink hypothesis list --state confirmed --json`, keeping those in the diff.
6. Replay each one's retest kit against the authorized target from bravos-env: `cxg pentest run --codebase . --target <url> --auth <profile> --template-dir .guardlink/cxg-replay/ --scope-file .guardlink/scope.yaml --attestation "<the human's words>" --session-dir .guardlink/pentest-findings/<run> --ci`. Copy the attestation verbatim from what the human typed; leave the flag off on loopback if they gave none. No kit yet: hand the threat to bravos-templatize first.
7. Read the result as bravos-prove does. Still confirmed: the fix did not hold; say so. Refuted with the same request: record it with `guardlink hypothesis refute <file:line> --evidence "<request sent and response received>"`, and tell the user the confirmation line in the source is theirs to remove. Killed, refused or not run: nothing was rechecked.
8. Check the fix added nothing: `guardlink diff <base> --fail-on-new --markdown`, then `guardlink lint . --since <base> --json`, applying each `fix` only to lines this session wrote.
9. Re-read the queue with `guardlink hypothesis next --json` and name the next item.

## Never

- Re-lock a stale claim with `guardlink verify --stale` or `--all` in bulk; each re-lock asserts a control still holds, so it needs the code read first.
- Remove or edit a `@confirmed` line; after a replay shows the exploit no longer works, the human removes it.
- Call a fix verified because the code changed, because a scan found nothing, or because a run was killed or refused.
- Replay against a target outside the committed scope, or without the human's typed authorization when it is not loopback.
- Write `@accepts` or `@entitles`.

## Done when

- Every stale claim in the change was re-read and either re-locked, corrected, or reported.
- Every confirmed threat on a changed path was replayed, or you said why it was not.
- `guardlink diff <base> --fail-on-new --markdown` exits 0, or each new exposure it lists is reported as open.
- You named the three states for each claim you touched and what was not tested.

## What it leaves for the next skill

- The re-locked, corrected and still-confirmed claims, and the replay run directory, for bravos-ship, and for a bravos-report retest report that records the outcome beside the original finding.

## Go deeper

- `${CLAUDE_PLUGIN_ROOT}/skills/bravos-prove/SKILL.md` — how a run's report is read.
- `${CLAUDE_PLUGIN_ROOT}/skills/bravos-annotate/SKILL.md` — the rules for correcting a claim.
