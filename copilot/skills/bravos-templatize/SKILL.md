---
name: bravos-templatize
description: "Turn the threat model's open exposures into correct, testable cxg templates in this session: follow guardlink's own translate method (the generated guardlink-translate skill, else the guardlink_translate MCP tool, else guardlink translate --stdout), validate what you write, keep replay kits apart from scan templates, steer cxg's own probe generation with repo-specific operator guidance, and record classes with no oracle as gaps. Use when asked to write pentest templates, make a finding testable, or prepare a retest kit."
---
<!-- bravos:generated -->

> Paths that start with `SKILL_DIR/` are files in this skill's own folder, the folder that holds this SKILL.md.
# Bravos templatize: claims become testable templates, nothing runs

## When

- The user asks for pentest or cxg templates, or to make an exposure testable.
- bravos-annotate or bravos-ship handed you new `@exposes` claims with no test.
- A confirmed threat needs a retest kit before its fix is rechecked.

## Do

1. Read the open exposures: `guardlink ci -f json` (`exposures[]`, `confirmed[]`) or the MCP tool `guardlink_lookup` with `unmitigated`. Pick the ones a request or a local invocation can show, and leave pure design or process gaps for an `@audit` note. Read the effort: the user's words ("at high"), else a `bravos effort: <level>` line in `AGENTS.md` / `CLAUDE.md`, else medium. It sets a starting budget, not a limit; go beyond it when the work needs it and say why in one line. Starting budget — low: exposures in changed files; medium: the top 5 from `guardlink hypothesis next --json`; high: the top 20; max: every open exposure.
2. Get the method, in this order. First open `.claude/skills/guardlink-translate/SKILL.md` and follow it (`guardlink sync` writes it; if it is missing, say `guardlink sync` would add it). Else call the MCP tool `guardlink_translate` (server `guardlink`) with `prompt: "<scope>"`; it returns the prompt, its output locations and a separate execution step. Else, from a shell, run `guardlink translate --stdout "<scope>"` only if `guardlink translate --help` lists `--stdout`, and follow the prompt it prints. You are the agent: do the work here. If none of the three is available, tell the user this guardlink offers no way to hand the method to the agent already in session (guardlink PR #98 adds `--stdout` back), and stop. Never fall back to a bare `guardlink translate`: it launches Claude Code.
3. Find the request that reaches each sink before you write its template. With the code graph (its MCP tools, or `bravos graph <question> --json` — same answers; see bravos-codegraph) (the briefing's `Code graph:` line says `current`, or `diverged` until a `no-exec` rebuild, bravos-codegraph step 2): `codegraph_call_chain` from the entry points (`codegraph_entry_points`, `codegraph_routes`) to the claim's symbol gives the route or RPC method, its handler and the parameters that flow into the sink; `codegraph_auth_boundary` on that route gives the identity the request needs (anonymous, a signed-in tenant, admin). Target that route with those parameters and the matching auth profile, put the chain (entry → … → sink) in the template's notes, and when several entry points reach the sink template the least privileged first. When `codegraph_entry_reach` says no entry point reaches it at high confidence, write no template: record "unreachable from any entry point per code graph" in the README and hand the claim to bravos-annotate to re-rate. Read `verdict` and `confidence` first; `unknown` or `insufficient_resolution` is not determined, never unreachable. Without the graph, trace the route from the handler by reading the code and say "code graph unavailable; traced by reading". A SAST finding joined to the claim (`bravos sast candidates`) gives its `route`, `entryPoint` and taint path too; use it alongside the graph's chain, and note it in the template. SAST findings not in the threat model go to bravos-annotate first, since templates come from claims. With no SAST report or SAST unavailable, carry on without it.
4. Write the templates under `.guardlink/cxg-templates/`, one per threat, following the engine contract and evidence shape the method gives. Keep every check non-destructive and scoped to confirming its one threat. Scanner templates (YAML, Python, shell) go there; JavaScript probes (`async function cxgProbe(cxg)`, `--contract probe`) go under `.guardlink/cxg-replay/` instead, because `cxg scan --template-dir` runs any probe it finds under cxg's default scope, not `.guardlink/scope.yaml`. In a probe, reach the target only through `cxg.fetch*` with well-formed arguments: cxg refuses at run time a probe that uses WebSocket, XMLHttpRequest, EventSource, `navigator.sendBeacon`, dynamic `import()`, or script or `innerHTML` injection, and `cxg template validate` does not catch it.
5. Validate: `cxg template validate .guardlink/cxg-templates/ --recursive --json`, and the same for `.guardlink/cxg-replay/`. It exits 1 when any template fails; a banner line can precede the JSON, so read from the first `{` or `[`. Fix each error and rerun until it reports none.
6. Record repo context for cxg's own generator. Copy `SKILL_DIR/operator-guidance.md` to `.guardlink/operator-guidance.md` if it is not there, and fill each section from the code: framework, auth shape, test identities, known false positives, out-of-bounds routes. bravos-prove passes it as `--skills-file` when cxg generates probes for exposures that have no kit.
7. For a confirmed threat that needs a retest kit, write a hand-written replay probe under `.guardlink/cxg-replay/`, kept apart from the scan templates. It carries `// @attach_scheme: path`, a `// @requires_identities:` line naming every login it needs (both sides of an IDOR; `anonymous` is the reserved no-login role), and no claim-identity stamps, so `--template-dir .guardlink/cxg-replay/` replays it against the same route. Keep that folder JavaScript probes only (a README is fine): one scanner file (`.yaml`, `.py`, `.sh`) there makes cxg refuse the whole replay run before it starts. cxg reads the folder recursively.
8. Apply the oracle rule: a vulnerability class cxg cannot judge from a response has no oracle. Record it in `.guardlink/cxg-templates/README.md` as unsupported, with the threat id and why, instead of writing a template that pretends to prove it. An invariant threat (`#inv-…`, from intent.md) maps to the cxg class that can judge it: another user's or tenant's data → `idor`; a role or permission gained → `privilege_escalation`; a field the caller should not set → `mass_assignment`; a check bypassed by concurrent requests → `race_condition`; a workflow step skipped or reordered → `business_logic`. Record each invariant's class in the README.
9. Commit the templates, the README and the filled guidance together, and hand the template ids and threat ids to bravos-prove.

## Never

- Run `guardlink translate` without `--stdout`, or with `--headless --agent` or an agent flag: each launches another agent. Use the skill, the MCP tool or `--stdout`.
- Run a template, a scan or any probe; this skill writes and validates only.
- Write a destructive check, or one that reaches beyond its single threat.
- Put `@exposure_*` or `@threat_id` stamps in a hand-written template; cxg stamps claim identity itself.
- Fake proof for a class with no oracle; record it as unsupported.
- Write `@accepts`, `@entitles` or `@confirmed`.

## Done when

- `cxg template validate --recursive --json` reports no errors for `.guardlink/cxg-templates/` and `.guardlink/cxg-replay/`, and the replay folder holds only JavaScript probes.
- `.guardlink/cxg-templates/README.md` maps each threat to its template, lists unsupported classes with reasons, and lists audit-only items.
- `.guardlink/operator-guidance.md` is filled from the code, not left as the starter.
- You told the user that nothing was run, so every claim stays untested.

## What it leaves for the next skill

- The scan-template and replay-kit directories, the guidance file path, and the template and threat ids, for bravos-prove, with each template's route and auth profile (from the code graph when it was available).

## Go deeper

- `.claude/skills/guardlink-translate/SKILL.md` — the translate method and the engine contract.
- `SKILL_DIR/operator-guidance.md` — what cxg's generator needs to know about this repo.
