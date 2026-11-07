---
name: bravos-sast
description: "Run licensed static analysis (bravos-cli) over the repo after the threat model is in place, read each finding's join to guardlink claims and its reachability, and gate on findings new since the base. When bravos-cli or its licence is absent, say plainly that SAST is unavailable and what would enable it. Use when asked for SAST, static analysis, dependency, secret or IaC findings, and when bravos-ship reaches its SAST step."
---
<!-- bravos:generated -->

> Paths that start with `SKILL_DIR/` are files in this skill's own folder, the folder that holds this SKILL.md.
# Bravos SAST: static findings joined to the threat model

## When

- The user asks for SAST, a code scan, dependency CVEs, leaked secrets or IaC checks.
- bravos-ship reaches its SAST step on a branch.
- A finding from another scanner needs placing against the threat model.

## Do

**Plan check first.** SAST is on the Team plan. Run `bravos licence --json` once per session (the briefing's `Plan:` line says the same); if `licensed` is false, tell the person in two sentences what this skill would do here and that it needs a Team licence — `bravos account activate` starts a 30-day trial with no card, or https://account.bugb.io/pricing — then stop, and do nothing else from this skill. A licence in grace still counts.

1. Run `bravos doctor`. SAST needs both `bravos-cli` found and a licence that verifies to a paid tier (`bravos licence` shows it: `BRAVOS_LICENCE`, or `licence.jwt` in `$BRAVOS_HOME`, `~/.bravos` or `~/.bugb`). `bravos-cli` is the analyzer bundle `bravos setup` stages under `$BRAVOS_HOME/analyzer/` (a machine that moved from the Python bravos may still have it inside that install; `bravos doctor` prints whichever it found). If it is missing, set it up yourself: `bravos setup --check`, show the person `bravos setup --dry-run --analyzer`, and with their go-ahead run `bravos setup --analyzer` (it fetches the signed bundle through the account portal and verifies it before anything lands). A missing licence is theirs to activate (`bravos account activate`); never invent or copy one. If either is still missing, tell the user SAST is unavailable, name the missing piece, and stop.
2. Annotate first: the analyzer reads guardlink's `@exposes` claims, so its recall depends on them. If the briefing shows the files in scope as unannotated, run bravos-annotate on them before analyzing.
3. Analyze with `bravos sast run` (add `--scope a/,b/` for part of the tree, `--min-severity`, `--timeout`): it runs `bravos-cli analyze . --ci --fail-on never --allow-incomplete-analysis --codegraph reuse -f json,sarif` under the bundle's own environment into `.bravos/sast/<run>/report.{json,sarif}` (not committed; reports can point at secrets, CI uploads the SARIF instead) and writes `meta.json` beside them, which the briefing's `SAST:` line and `bravos sast` read.
4. Read the exit code first: 0 no finding at or above the level; 1 findings; 3 the licence was refused or the analysis failed; 4 a required stage failed. Exit 3 and 4 are unavailable or incomplete, never clean.
5. Read the findings through `bravos sast candidates` (`--json` for the full list, `--all` to include unknown reach): reachable findings joined to a claim (with its state), reachable ones not in the threat model yet, dependencies with whether the vulnerable function is reached, and secrets.
6. Sort them: a finding joined to an open `@exposes` is that same risk, not a new one: hand it to bravos-templatize, whose template can target the finding's route and taint path; an unjoined reachable finding is a gap in the threat model: hand it to bravos-annotate to record honestly as an `@exposes` with its `@audit`; an unreachable one is reported as such, not dropped; a secret is reported for rotation and never becomes a pentest candidate.
7. Gate what is new: analyze the base too (or use the committed baseline) and run `bravos-cli diff .bravos/sast/<run>/report.json <base report.json> --fail-on-new`. Exit 4 means the two reports use different finding-identity schemes: re-run the base with the same analyzer, never read it as no new findings.
8. Report by severity: joined versus unjoined, reachable versus unreachable, new versus already on the base, and what was not analyzed.

## Never

- Call the code clean unless `bravos-cli analyze` exited 0, and then only at the level it was run with.
- Treat a licence refusal, a missing binary or a crashed run as a pass.
- Baseline, suppress or delete a finding to make the gate pass; that is the human's decision.
- Treat a SAST finding as a confirmed exploit, or write `@confirmed`, `@accepts` or `@entitles`; a static finding is a lead, and only a reproduced run confirms.
- Run `guardlink annotate` with an agent flag to fill a gap; hand it to bravos-annotate.
- Commit a SAST report, or quote a secret's value anywhere; name the rule, file and line only.

## Done when

- Either SAST ran and its exit code and every finding's join and reachability were reported, or you said exactly why it could not run.
- New findings since the base are listed, and `bravos-cli diff` exited 0 or each new one is reported as open.
- Unjoined reachable findings were handed to bravos-annotate.

## What it leaves for the next skill

- The SARIF and JSON paths and the list of new and unjoined findings, for bravos-ship and bravos-cicd; `bravos sast candidates` for bravos-annotate (unjoined leads), bravos-templatize and bravos-prove (joined findings with their routes), and bravos-recheck (rescans after a fix).

## Go deeper

- `SKILL_DIR/../bravos-annotate/SKILL.md` — recording an unjoined finding as a claim.
- `SKILL_DIR/../bravos-ship/SKILL.md` — where SAST sits in the pre-PR gate.
