---
name: bravos-codegraph
description: "Ask the repo's code graph (codegraph-mcp) one bounded question — routes, attack surface, sinks a symbol reaches, whether code is live, blast radius, annotation gaps in a change — instead of grepping. Use before editing security-relevant code, when judging a finding's reachability, when tracing a handler to its sinks, and when bravos-annotate or bravos-ship needs targets."
---
<!-- bravos:generated -->
# Bravos codegraph: one question, one tool, one verdict

## When

- You are about to edit security-relevant code and need its callers or blast radius.
- You are judging whether a finding's code is reachable from an entry point, or live at all.
- You are tracing a handler to the sinks it reaches, or listing routes and attack surface.
- bravos-annotate or bravos-ship needs file:symbol targets, such as unannotated entry points in a change.

## Do

**Plan check first.** The code graph is on the Team plan. Run `bravos licence --json` once per session (the briefing's `Plan:` line says the same); if `licensed` is false, tell the person in two sentences what this skill would do here and that it needs a Team licence — `bravos account activate` starts a 30-day trial with no card, or https://account.bugb.io/pricing — then stop, and do nothing else from this skill. A licence in grace still counts.

1. Ask the graph one bounded question per call; a graph answer replaces reading or grepping the tree. There are two ways in, with the same answers: the MCP tools (`codegraph_attack_surface` …) when the `codegraph` server is connected, or `bravos graph <question> --json` in the shell, where the question is the tool name without `codegraph_` and with hyphens (`codegraph_attack_surface` → `bravos graph attack-surface --json`, `codegraph_callers` → `bravos graph callers '<file>::<symbol>' --json`; `bravos graph --json` lists every question and its arguments). The shell route needs no MCP reconnect and works in every harness. The briefing's `Code graph:` line says which route is there. If neither is (no codegraph-mcp), set it up yourself: `bravos setup --check` reports what is missing without changing anything; show the person `bravos setup --dry-run --codegraph` and with their go-ahead run `bravos setup --codegraph` (it fetches the signed bundle through the account portal and verifies it before anything lands). If an install fails, quote its error and give the exact command for their own terminal; until then say "code graph unavailable; the other skills read the code instead" and answer by reading. Read the effort: the user's words ("at high"), else a `bravos effort: <level>` line in `AGENTS.md` / `CLAUDE.md`, else medium. It sets a starting budget, not a limit; go beyond it when the work needs it and say why in one line. Starting budget — low: the one question asked; medium: whatever questions the task needs; high: start from `codegraph_attack_surface`; max: the full attack surface plus `codegraph_impact` on every changed symbol.
2. Build or refresh the graph when an answer says there is none for this repository, or its `graph_currency` is `diverged`: `bravos graph build . --scip no-exec` indexes without running the repository's build scripts (`--scip auto` and `--isolate` run them; use those only on a repo the user trusts and only when they say so). A build that reports `semantic <language>: off` lacks that language's type checker; say that calls through interfaces may not connect and that `bravos setup --indexers` (with their go-ahead) adds it. For the MCP route, `bravos sync` registers the server from the bravos install; the person reconnects MCP (`/mcp` in Claude Code) to load it. In a bravos workspace, build one graph over the app folder (`bravos graph build <app folder> --scip no-exec`, the folder the briefing's `Workspace:` line names) and ask cross-service questions there: only a graph that holds both services links one service's HTTP, gRPC, GraphQL or OpenAPI client call to the other's handler (`callees` shows `via_framework`). A graph built inside one member stops at its own repository.
3. Pick the one tool that answers the question:
   find a symbol → `codegraph_search`
   routes → `codegraph_routes`
   ranked attack surface → `codegraph_attack_surface`
   sinks reachable from a symbol → `codegraph_reachable_sinks`
   is it live (reachable from an entry point) → `codegraph_entry_reach`
   blast radius of a change → `codegraph_impact`
   callers → `codegraph_callers`
   unannotated entry points in a change → `codegraph_annotation_gaps`
   who may reach a route → `codegraph_auth_boundary`
   the call path from an entry point to a symbol → `codegraph_call_chain`
   untested exposures ranked by reach → `codegraph_untested_exposures`
   code no entry point reaches → `codegraph_dead_code`
4. Read `verdict` and `confidence` before anything else in the answer. `unknown` and `insufficient_resolution` mean the graph could not tell: report them as not determined, never as clean or unreachable.
5. Quote the tool's verdict with its confidence, and hand the file:symbol targets to bravos-annotate (gaps to annotate) or bravos-ship (gaps blocking a PR).

## Never

- Treat `unknown` or `insufficient_resolution` as clean, unreachable or dead.
- Grep or read the tree for a question the graph answers while `graph_currency` is `current`.
- Build with `--scip auto`, `--scip trusted` or `--isolate` (they run the repository's own build scripts) without the user's say-so.

## Done when

- You asked one question, named the tool, and quoted its `verdict` and `confidence`.
- If the graph was `diverged`, you rebuilt with `no-exec` and the answer you report came after the rebuild.
- Reachability is not exploitability: say the graph judged reach, and that no run tested the finding. An exposure the graph shows as reachable is still untested until a run confirms or refutes it.

## What it leaves for the next skill

- A short list of file:symbol targets with the verdict and confidence that produced each, for bravos-annotate or bravos-ship.
- The same tools serve other skills directly: bravos-templatize (the route and auth that reach a sink), bravos-recheck (callers and blast radius of a fix), bravos-context (the real public surface) and bravos-prove (test order by reach). Each falls back to reading the code when the graph is unavailable.

## Go deeper

- The tool list the `codegraph` MCP server exposes (ask your MCP client for it) — 31 tools; the nine above cover Phase 1.
- `docs/GUARDLINK_REFERENCE.md` — how graph targets map to annotations.
- `.claude/skills/guardlink-annotate-exploitable/SKILL.md` — the evidence bar for a claim built from a graph answer (written by `guardlink init --agent claude` under `.claude/skills/` when present; otherwise `guardlink annotate --stdout --playbook exploitable "<scope>"` prints the same method).
