---
name: bravos-cicd
description: "Audit and write the repo's security CI: the bravos PR gate (validate, lint since the merge base, undisclosed new exposure, confirmed exploits on changed paths, SARIF to code scanning), the nightly annotation workflow, and optional licensed SAST, fixing broken guardlink calls and script-injection risks in existing workflows. Use when asked to add or review security CI, a PR gate, code-scanning upload or a nightly job, or when a workflow calls guardlink with flags it does not have."
---
<!-- bravos:generated -->

> Paths that start with `SKILL_DIR/` are files in this skill's own folder, the folder that holds this SKILL.md.
# Bravos CI/CD: the gate and the nightly job as workflows

## When

- The user asks to add, fix or review security CI, a PR check or code-scanning upload.
- bravos-schedule chose the nightly workflow.
- An existing workflow calls guardlink or cxg, or interpolates pull-request text into a shell step.

## Do

**Plan check first.** CI and nightly workflows are on the Team plan. Run `bravos licence --json` once per session (the briefing's `Plan:` line says the same); if `licensed` is false, tell the person in two sentences what this skill would do here and that it needs a Team licence — `bravos account activate` starts a 30-day trial with no card, or https://account.bugb.io/pricing — then stop, and do nothing else from this skill. A licence in grace still counts.

1. Audit `.github/workflows/*.yml`. For each guardlink or cxg call, check every flag against that command's `--help`; a `guardlink diff` call with `--from`/`--to` flags is the known broken pattern, since diff takes one positional ref. Flag any `github.event.pull_request`, issue or comment field, or `github.head_ref`, expanded straight into a `run:` line: that text is attacker-controlled and runs as shell.
2. Write bravos's workflows with `bravos init --ci` (or `bravos sync --ci`): `bravos-pr-gate.yml` plus the nightly variants. Delete the nightly variant for the harness the team does not use. A workflow someone edited by hand is kept and reported; never overwrite it.
3. Check the PR gate does what bravos-ship does: `guardlink validate .`, `guardlink lint . --since <base>` against the merge base, `guardlink diff <base> --fail-on-new --markdown` (passing when the PR body discloses new exposure in a Security gate section), a block on confirmed claims in changed files, and `guardlink sarif . --profile github -o guardlink.sarif` uploaded to code scanning.
4. Fix what the audit found in workflows bravos did not write: replace a broken guardlink call with the form above, and pass event text through `env:` and quote it in the shell. Show each change to the user before committing it.
5. SAST in CI, only when the team has a bravos licence: add a step running `bravos-cli analyze . --ci --fail-on error -f sarif,json -o sast` with the licence from a repo secret, and upload `sast.sarif` under its own code-scanning category.
6. Validate the workflows: run `actionlint` on them if it is installed; otherwise parse each as YAML. Fix every error.
7. Name the secrets and settings the user must add (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for the nightly job, the bravos licence for SAST, permission for Actions to create pull requests) without writing any value.
8. Ship the workflow changes as a pull request through bravos-ship.

## Never

- Write a secret, token, licence or session into a workflow or any committed file.
- Interpolate pull-request, issue or comment text, or a branch name, directly into a `run:` line.
- Use `guardlink validate . --strict` as a PR gate on a repo with recorded legacy exposures; it fails on every one of them, not on what the PR adds.
- Add a job that runs a live test or scan unattended; that needs the human's authorization typed in a session.
- Delete or rewrite a workflow bravos did not write without the user's go-ahead.
- Write `@accepts`, `@entitles` or `@confirmed`.

## Done when

- Every guardlink and cxg call in the repo's workflows uses only flags that command has, and no workflow writes event text into a shell line.
- `actionlint` (or a YAML parse) reports no error on any workflow you wrote or changed.
- The user has the list of secrets and settings to add, and the change is in a pull request.

## What it leaves for the next skill

- The workflow files, the audit findings in workflows bravos did not write, and the secrets still to add, for bravos-ship.

## Go deeper

- `SKILL_DIR/../bravos-ship/SKILL.md` — the gate these workflows run.
- `SKILL_DIR/../bravos-schedule/SKILL.md` — choosing between a loop, a nightly job and a cloud task.
