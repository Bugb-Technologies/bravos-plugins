---
name: bravos-report
description: "Write a crisp, evidence-bound white-box VAPT write-up in this session: a full assessment, a single finding, a retest report or an executive brief, built only from the facts bravos report data gathers (threat model, hypothesis ledger, cxg runs, SAST, code graph, intent, scope), with every claim of proof citing its evidence and its evidence level computed rather than asserted; check it with bravos report check, then export it to md, txt, html or pdf. Use when asked to write up, report, summarise for leadership, document a finding, or record a retest."
---
<!-- bravos:generated -->
# Bravos report: decisions first, evidence underneath, nothing claimed that was not shown

## When

- The user asks for an assessment report, a write-up, a summary for leadership, or the findings documented.
- bravos-prove confirmed or refuted something, and the result should reach someone who was not in the session.
- bravos-recheck replayed a fix, and the retest should be recorded next to the original finding.
- An engineer needs one finding written so they can reproduce it, fix its cause and show closure.

## Do

1. Pick the kind from the request: `assessment` (the default: the full eight-section report), `finding` (one self-contained write-up; needs `--finding <claim key prefix | file:line | EXP id>`), `retest` (original result, replay, residual exposure) or `brief` (the decision summary alone). Read the effort as the other skills do; it sets how deep the system context and narratives go, never which facts are included.
2. Gather the facts: `bravos report data --kind <kind>` (add `--finding …` for one finding, `--no-graph` when the graph is slow or absent). It writes `.bravos/reports/<id>/evidence.json` and prints the report id and folder. Read the bundle: `candidates` are the exposures with their computed `level`, `items` are every citable fact by id, `runs` are the cxg results, `gaps` are what could not be gathered. If `runs` is empty, say in the report that nothing was exercised at runtime; no finding may then read as reproduced.
3. Read `.guardlink/intent.md` (in the bundle as `intent.text`): its Assumptions name the attacker starting positions, the configuration baseline and the scope decisions. Keep the tester's access (source code, admin credentials, the loopback target) apart from what an attacker needs: every finding states the attacker's prerequisites, never the tester's. Then collect what a reader needs to rebuild the test, from the run folders the bundle lists, `.guardlink/proving.md` (target and start command), `.guardlink/scope.yaml` and the session's own history: how the product was built; every config and feature-flag change; how keys and accounts were made and which permission each held; what was seeded; and every helper written to test it (a stub handler, a gRPC client or worker), with how to install and run it. Copy the config files and scripts, never keys or tokens, into the run folder so the report can point at them.
4. Consolidate before you write: group exposures that share one root cause into one finding (cite every EXP id it covers); order findings by remediation priority (exposure, asset sensitivity, prerequisites, compensating controls), kept apart from technical severity; build an attack narrative only from steps the evidence links (a run's chained steps, flows in the model, a code-graph call chain), and cite each step.
5. Write `.bravos/reports/<id>/report.md` from the template for the kind: `${CLAUDE_SKILL_DIR}/assessment.md`, `${CLAUDE_SKILL_DIR}/finding.md`, `${CLAUDE_SKILL_DIR}/retest.md` or `${CLAUDE_SKILL_DIR}/brief.md`, in the voice `${CLAUDE_SKILL_DIR}/style.md` sets. Write for the team that has to act on it: plain words first; what the attacker wants and what they need; why it is a vulnerability; the weaknesses one by one and how they chain step by step; the environment and the roles table; a cxg reproduction (`cargo install cert-x-gen`, the template, the exact `cxg scan` command and its expected output); granular manual steps; what held; and the fix with how to check it. Evidence ids go in the closing Evidence section, not in the prose. When the proof is a script rather than a cxg template, hand it to bravos-templatize to become one, and have bravos-prove replay it under the person's authorization before you quote its output; otherwise say the cxg command was not run.
6. Give each finding a `**Status:**` line with the bundle's computed level for what it cites, word for word: `reproduced at runtime`, `control held at runtime`, `established by code or configuration review`, or `suspected, awaiting validation`. Repeat it in the Evidence section with the evidence ids in parentheses (the top line may say "see Evidence"). A weaker label than the evidence supports is allowed; a stronger one is not. "Not reproduced" names the conditions tested, from the run's not-run causes.
7. Write coverage with its denominator ("cross-tenant reads exercised on 3 of 11 routes"; "83% of files, 1,417 of 1,712"), list the controls that held next to the weaknesses, and keep raw tool output in the appendices. Quote requests and responses from the run evidence with tokens and credentials redacted; the bundle already redacts what it recognises.
8. Severity: give the rating and its rationale in this application's context. Use CVSS only when you can state the version and the full vector from facts in the bundle; never a bare score.
9. Check: `bravos report check <id>`. Fix every error and rerun until it passes; read the warnings (long paragraphs, vague titles) and fix the ones that would slow a reader down.
10. Export: `bravos report export <id> --format md,html` by default, or the formats the user asked for (`txt`, `pdf`; `--open` to open the html or pdf). PDF needs an installed Chrome, Edge, Brave or Chromium; without one, the html stands and the command says so.
11. Tell the user where the files are, how many findings are reproduced at runtime, established by review, and suspected, and what remained untested (the bundle's gaps and not-run causes). The report stays in `.bravos/reports/`, which git ignores; sharing it is the person's decision.

## Never

- Call a finding reproduced, or a control held, without a ledger record or a run result the bundle lists; the check refuses it, and so should you.
- Write `@confirmed`, `@accepts` or `@entitles`, or change a claim's tested state from a report; reports describe the ledger, they never write it.
- Print a live secret, token, password or session cookie; cite the rule and file:line instead, as the SAST secrets list does.
- Send traffic, start a target, or run a probe; this skill only reads the evidence and writes.
- Turn a dependency advisory into an exploit claim when the vulnerable function is not shown reached.
- Commit the report folder, or copy evidence into a tracked file, unless the person asks and has redacted it.

## Done when

- `bravos report check <id>` passes for the report.
- The exports the user asked for exist beside `report.md`, and you named them.
- The user knows what is reproduced, what is code-review only, what is suspected, and what was not tested.

## What it leaves for the next skill

- Each finding's F-id, its EXP ids and claim keys: bravos-recheck replays the reproduced ones after a fix, and a retest report records the outcome next to the original.
- The remediation roadmap, with acceptance criteria per item, for tickets (`@ticket` is the developer's to add).

## Go deeper

- `${CLAUDE_SKILL_DIR}/assessment.md` — the eight sections in reading order, and what each gives the reader.
- `${CLAUDE_SKILL_DIR}/finding.md` — the fields every finding carries.
- `${CLAUDE_SKILL_DIR}/retest.md` and `${CLAUDE_SKILL_DIR}/brief.md` — the other two kinds.
- `${CLAUDE_SKILL_DIR}/style.md` — how to write it so an engineer can act without asking the author.
