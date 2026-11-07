---
name: bravos-context
description: "Learn what the software intends before judging its code: for a project being researched (the default) draft its intent from upstream's own docs and ask only the scope decisions — configuration baseline, deployment, attackers in scope, unclear intended behaviours; for the user's own product run the owner interview — and get answers in bravos's review page, pre-filled with suggestions the team edits and confirms. Record them as .guardlink/intent.md plus actors, assets, invariant threats and boundaries in the threat model. Use when .guardlink/intent.md is missing, when asked to learn the app or its business logic, to say what matters or what is intended, before a first annotation pass or campaign, and after a large change to the product."
---
<!-- bravos:generated -->

> Paths that start with `SKILL_DIR/` are files in this skill's own folder, the folder that holds this SKILL.md.
# Bravos context: what the product intends, so threats mean something

## When

- `.guardlink/intent.md` is missing, and bravos-annotate, bravos-campaign or the front door is about to judge code.
- The user asks you to learn the app, its business logic, what matters, or whether something is intended.
- The product changed a lot (new roles, payments, tenants, a new surface); refresh the intent.

## Do

1. Decide the perspective. **Researcher** (the default): the repo is software being studied, such as an open-source project or a vendor's code; its intent is upstream's to state. **Owner**: the repo is the user's own product; it is theirs. Use what the user said, the origin remote and the README; ask in one line only if it is unclear.
2. Read before you suggest. Researcher: upstream's security docs, deployment and hardening guides, SECURITY.md and docs/, each with its URL or path, then the auth and role code. Owner: the README, route table, auth and role code, data models, anything touching money or other users' data. Both: `.guardlink/definitions.*`, and `.guardlink/intent.md` if it exists (you are refreshing, not starting over). Build the code graph first when there is none or it is diverged: `bravos graph build . --scip no-exec` (no tokens, a few minutes; bravos-codegraph step 2). With the code graph (its MCP tools, or `bravos graph <question> --json` — same answers; see bravos-codegraph) (briefing `Code graph:` says `current`): `codegraph_routes`, `codegraph_attack_surface` and `codegraph_auth_boundary` give the real public surface — which routes answer unauthenticated callers, which need a tenant, which are admin-only; cite "code graph" as the source of each fact, suggestion and candidate INT item they produce ("these N APIs answer unauthenticated callers; upstream documents M of them"). Without it, say "code graph unavailable; surface read from the route table" and read the routes and auth code.
3. Suggest every answer yourself. Researcher, the open decisions (5 to 8, each `mustTouch: true`): which configuration to rate against (shipped defaults, upstream's recommended hardened setup, or both); single organisation or multi-tenant; which attackers are in scope (`multi`: unauthenticated network, authenticated low-privilege tenant, malicious client or worker, compromised peer or replica, internal network, operator, suggesting the last two out unless upstream says otherwise); each intended-looking behaviour upstream does not clearly document ("upstream is silent"); which invariants to test first. Everything else is a fact with `folded: true` and its source: actors, crown jewels, boundaries, behaviours upstream documents as intended (cite where), and invariants worded as the properties upstream claims. Owner: purpose, users and roles, crown jewels, two to five must-never rules, intended-by-design powers and boundaries; open by default, the rule and intended items `mustTouch`. Give every question a `suggested` answer, a one-line `reason`, its `sources` and a `confidence`; mark `low` and `mustTouch` anything you are unsure of.
4. Write it to `.guardlink/intent-draft.json` (schema `bravos.review/v1`, `perspective` set; question types `choice`, `multi`, `item`, `text`) and run `bravos review intent`. Tell the user: "the page that just opened has my suggestions filled in; change what is wrong, make the calls marked 'needs your call', then Confirm. Teammates run `bravos review intent` after pulling; say done when everyone has." If they prefer chat, or no browser can open, ask the same open decisions in one message. If they ask to share it on claude.ai and this is Claude Code, run `bravos review intent --share`, say first that their security intent will sit on claude.ai, publish the page it writes with the Artifact tool and `capabilities: {db: {}}`, and give them the link.
5. Wait for "done". Run `bravos review intent --summary` (for a shared page, first copy each document in its `answers` collection to `.guardlink/intent-answers/<name>.json` with ArtifactData). Settle each DISAGREE with the people involved; take EDITED answers as given. If the user is away on an unattended campaign, record your suggestions marked `— draft` and carry on; never record a decision nobody made.
6. Write `.guardlink/intent.md` from `SKILL_DIR/intent.example.md`. Researcher: an `## Assumptions` section first, with the configuration baseline, deployment and attackers in scope, each ending `— set by <names>, <date>`. Then purpose, actors, crown jewels, invariants `INV-1`…, intended-by-design `INT-1`… (researcher items carry `(upstream: <url or path>)`, or `(upstream is silent)`), and boundaries. End each item with how it was decided: `— suggested by bravos, accepted by <names>`, `— edited by <names>`, `— chosen by <names>`, or `— draft`. Commit the draft and answers files with it.
7. Put the structured facts in the threat model. In `.guardlink/definitions.*`, reusing ids and never redefining one: `@actor` per role, `@asset` per crown jewel, and one `@threat` per invariant, e.g. `@threat Cross-tenant read (#inv-tenant-isolation) [high] -- "INV-2: a user reads only their own tenant's orders"`. Beside the code they describe: `@handles <class> on <Asset>` for each crown jewel's data and `@boundary` for each boundary.
8. Run `guardlink validate .` and fix what it reports in the lines you wrote.
9. Commit `.guardlink/intent.md` and the definitions together, message `context: intent and invariants`.
10. Hand the invariant threat ids, the Assumptions and the intended-by-design list to bravos-annotate.

## Never

- Mark a draft invariant or intended-by-design item as confirmed, or put words in the user's mouth.
- Record a must-touch decision (an assumption, an unclear intended behaviour) as made unless a named person chose it in the page or in chat; accepting a suggestion untouched never counts for those.
- Present an upstream behaviour as intended without citing where upstream says so; write "upstream is silent" instead.
- Mark an item confirmed that no named person agreed to, in the review page or in chat.
- Publish the review page to claude.ai unless the user asked to share it and heard that it puts their security intent there.
- Rewrite a confirmed line in `.guardlink/intent.md`; append a dated change beneath it instead.
- Treat an intended-by-design item as an accepted risk: write `@accepts`, `@entitles` or `@confirmed`, or remove an existing claim because of it.
- Redefine an id that already exists in `.guardlink/definitions.*`.

## Done when

- `.guardlink/intent.md` exists, and every item is marked confirmed or draft.
- To read it again later, nothing needs re-running: `.guardlink/intent.md` itself, `bravos review intent --summary` (answers against suggestions), or `i` in `bravos watch`. Re-run this skill only to refresh the intent after the product or scope changes.
- Each invariant has a threat id in the definitions, and `guardlink validate .` exits 0.
- You told the user which items are still drafts and what confirming them changes.

## What it leaves for the next skill

- The invariant threat ids, the intended-by-design list and the boundaries, for bravos-annotate and bravos-templatize.

## Go deeper

- `SKILL_DIR/intent.example.md` — the shape of the intent file, with examples.
- `SKILL_DIR/../bravos-annotate/SKILL.md` — how intent changes what gets annotated and how it is rated.
