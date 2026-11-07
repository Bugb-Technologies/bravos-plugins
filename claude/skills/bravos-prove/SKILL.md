---
name: bravos-prove
description: "Run the authorized test against a target the user owns and record what it showed: export the claims for cxg, replay the kits written in this session, let cxg generate probes for the rest through a model API, read the report's buckets and exit code, and write outcomes back only through guardlink's hypothesis ledger. Use when asked to prove, test or verify a finding, to check whether an exposure is exploitable, or after bravos-templatize and bravos-env have prepared a run."
---
<!-- bravos:generated -->
# Bravos prove: an authorized run, and only a run decides

## When

- The user asks whether an exposure is exploitable, or to prove, test or verify a finding.
- bravos-templatize wrote templates and bravos-env has a target ready.
- `guardlink hypothesis next` puts an untested exposure at the top.

## Do

1. Check the preconditions from bravos-env: a target that answers, `.guardlink/scope.yaml` committed, each profile passing `cxg pentest auth verify --profile <name>`, and for any non-loopback target both a reviewed scope and the human's authorization typed in this session. If one is missing, stop and hand back to bravos-env. Read the effort: the user's words ("at high"), else a `bravos effort: <level>` line in `AGENTS.md` / `CLAUDE.md`, else medium. It sets a starting budget, not a limit; go beyond it when the work needs it and say why in one line. Starting budget — low: replay existing kits only; medium: also cxg generation for exposures without a kit, `--max-templates 8`, after asking about the spend; high: `--max-templates 32` with `--enable-chaining`; max: every testable class, spend pre-approved (no question).
2. Order what to test, then read how the person wants proving handled. With the code graph (its MCP tools, or `bravos graph <question> --json` — same answers; see bravos-codegraph) (briefing `Code graph:` says `current`): `codegraph_untested_exposures` and `codegraph_untested_reach` rank untested exposures by reach; test the ones intent.md's Assumptions put in scope first, least privileged entry point first, and report exposures only an out-of-scope attacker reaches instead of running them. Without the graph, say "code graph unavailable; using guardlink hypothesis next order" and use that queue. Within that order, an exposure with a reachable SAST finding joined to it (`bravos sast candidates`) goes before one without, and its route goes into the run notes; with no SAST report or SAST unavailable, skip this. Then, for how the person wants proving handled: the briefing's `Proving:` line, from `.guardlink/proving.md`. If it is not set, ask them once, with a suggestion drawn from the repo (for example, "you have a docker-compose; I'd prove automatically on 127.0.0.1:8080"): prove automatically on their loopback target whenever new or changed exposures appear, ask each time, on a schedule (bravos-schedule's nightly), or not now; and whether cxg may generate probes through a model API, which spends money. Record their answer in `.guardlink/proving.md`: lines `choice: auto|ask|schedule|none`, `target: <loopback url>`, `start: <start command>`, `generation: yes|no`, their words quoted verbatim, and `— confirmed by <their name>, <date>`. Then follow it: `auto` proceeds on that target with their quoted words as the attestation and, with `generation: yes`, the spend approved; `ask` asks now; `schedule` hands to bravos-schedule; `none` stops here and says so. When they change their mind, rewrite the file with their new words.
3. Export the claims cxg reads: `guardlink sarif . --profile pentest -o whitebox/findings.sarif`.
4. Web or Electron target: replay the kits written in this session with `cxg pentest run --codebase . --target <url> --auth <profiles> --no-author --template-dir .guardlink/cxg-replay/ --scope-file .guardlink/scope.yaml --attestation "<the human's words>" --session-dir .guardlink/pentest-findings/<run> --ci`, adding `--target-type electron` for an Electron app. `<profiles>` is every login the kits' `@requires_identities` lines name, comma-separated (`victim,attacker` for an IDOR kit), each verified in bravos-env; a kit whose login is missing is skipped. `--no-author` keeps a replay to zero model calls: without it cxg can rewrite an ambiguous probe through the claude CLI. Copy the attestation verbatim from what the human typed; leave the flag off on loopback if they gave none. In a bravos workspace, run each kit against the URL of the service that owns its file (`bravos workspace show` lists the services, their URLs and the calls between them); a chain that crosses services is run one hop at a time, each hop against its own service's URL under that service's scope and authorization, with the previous hop's result carried as the next hop's input — never one run pointed at several hosts.
5. Exposures with no kit yet: let cxg generate probes from the exported claims, steered by the operator guidance. First tell the user the run calls a model API (up to the template budget) and get their go-ahead, unless they already approved the spend (effort max, or a standing line saying so); then run `cxg pentest run --codebase . --target <url> --auth <profile> --ai --ai-provider anthropic --max-templates 8 --skills-file .guardlink/operator-guidance.md --scope-file .guardlink/scope.yaml --attestation "<the human's words>" --session-dir .guardlink/pentest-findings/<run> --ci` (use `openai` if that is the key the user has). Copy every generated template that confirmed or refuted into `.guardlink/cxg-replay/` so the next run replays it.
6. Network or CLI templates from the translate method: run `cxg scan --scope <url> --template-dir .guardlink/cxg-templates/ --output .guardlink/pentest-findings/<run> --output-format json,sarif`, with a loopback URL or `cli:///absolute/path/to/binary` as the scope. That folder holds scanner templates only (bravos-templatize keeps probes in `.guardlink/cxg-replay/`); if a JavaScript probe is in it, cxg runs it under its default scope, so move the probe out, or add `--scope-file .guardlink/scope.yaml --auth <profiles> --session-dir .guardlink/pentest-findings/<run>` before running.
7. Read the exit code before the report. For `cxg pentest run`: 0 none confirmed, 1 no templates ran, 2 confirmed findings, 3 hard-killed (5xx streak, scope violation, target died), 4 refused (at pre-flight, or a supplied probe was skipped for a missing login or refused), 5 session dead in CI. On 3 or 5 stop: nothing was proven, so report the cause and hand back to bravos-env. On 4 read the report before concluding: its `status`, `auth_skipped` and `probe_refusals` say what was skipped and why, and any probe that did run keeps its confirmed or refuted result. Write back those results, report the skipped ones as untested with their cause, and hand a missing login to bravos-env. For `cxg scan` with probes: 2 means confirmed, 4 a probe refused.
8. Read the report's buckets: confirmed, refuted (a mitigation held), ambiguous, and not run with its cause. Ambiguous and not-run results prove nothing either way; report them as untested.
9. Write back the confirmations: `guardlink hypothesis confirm --from-scan .guardlink/pentest-findings/<run>/report.json --write`. It records only findings whose claim key resolves, and writes the source line only for uncontested ones.
10. Record each refuted result against its claim: `guardlink hypothesis refute <file:line> --evidence "<request sent and response received>"`, quoting the report entry.
11. Run `guardlink hypothesis list --state confirmed --json` and report each new confirmation with its threat, asset and file:line, plus the refutations and every result left untested.
12. Hand confirmed threats to the user as fix-first, and to bravos-recheck once a fix lands.

## Never

- Pass `--ai-provider claude`, `codex`, `gemini`, `crush` or `auto` to `cxg pentest run`; those launch another agent CLI. Only the API providers `anthropic` and `openai` generate probes, and only with the spend approved.
- Run against a host outside the committed scope, or without the human's typed authorization when the target is not loopback.
- Write `--attestation` text the human did not type, here or in `.guardlink/proving.md`.
- Record a proving preference the person did not state, or read one as covering more than it says: it never covers a non-loopback target or a destructive class.
- Use `--destructive-ok` unless the target is a disposable loopback instance and the human asked for it.
- Write `@confirmed` yourself, or treat reading code as a confirmation; only `guardlink hypothesis confirm --from-scan` from a real report writes it.
- Call an exposure refuted because a run found nothing, or because the run was killed, refused or never ran its template.
- Write `@accepts` or `@entitles`.

## Done when

- The run exited 0 or 2 and its report was read bucket by bucket, or you reported why it stopped.
- Every confirmed finding went through `guardlink hypothesis confirm --from-scan`, and every refutation cites its request and response.
- For each claim you reported its three states: open or mitigated, confirmed, refuted or untested, and verified or stale, plus what was not tested.

## What it leaves for the next skill

- The run directory, the confirmed and refuted claim keys, and the untested ones, for bravos-recheck and bravos-ship, and for bravos-report to write up what was proven.

## Go deeper

- `${CLAUDE_PLUGIN_ROOT}/skills/bravos-env/SKILL.md` — the target, scope and session this run depends on.
- `${CLAUDE_PLUGIN_ROOT}/skills/bravos-recheck/SKILL.md` — replaying these kits after a fix.
