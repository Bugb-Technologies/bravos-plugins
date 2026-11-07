# Assessment template

The full white-box assessment, in reading order: decisions first, then progressively deeper evidence. Keep the eight `##` headings as written (the numbers are optional); `bravos report check` reads them in this order.

```markdown
# <Application> security assessment — <month year>

## 1. Executive assessment

<One to two pages. The main risks in plain words, what was demonstrated (and what was only reviewed), the strengths that held, and the decisions needed from the reader. Lead with the single most important sentence.>

## 2. Scope and limitations

<Applications, repositories, environments, roles and workflows assessed; exclusions; the access provided to the tester; dates; the reviewed commit and the tested build; the configuration baseline from intent.md; and what was unavailable (the bundle's gaps).>

## 3. System and threat context

<A compact diagram of the real boundary or flow (a fenced mermaid block or a short list), the sensitive assets, the trust boundaries, and the attacker starting positions in scope (intent.md's Assumptions). Separate the tester's access from the attacker's.>

<For an app made of several services (a workspace bundle, `bravos report data --workspace`): a short "Services and the calls between them" part — each service, where it answers, and each cross-service call (EDGE-n) that an attack can cross. Cite a service's evidence with its prefix, e.g. `orders:EXP-3`.>

## 4. Coverage and approach

<What was examined and how deeply, with denominators: annotated files out of source files, exposures tested out of declared, routes exercised out of routes known, roles used. Name the controls that held. Name what was not tested and why (not-run causes, missing logins, out-of-scope attackers).>

## 5. Principal attack narratives

<How the most consequential weaknesses work together, step by step, each step citing its evidence id. Only chains the evidence links; a plausible chain nobody exercised is labelled as such.>

## 6. Findings

<One block per finding, ordered by remediation priority: a "### F-01 — <who can do what to what>" heading, then the finding template's lines and sections (finding.md) one heading level down — **Status:** and **Severity:** lines, then #### headings for what the attacker needs, what we found, how it chains, impact, how to reproduce (cxg and by hand), what held, and the fix with how to check it.>

## 7. Remediation roadmap

<A table: action, finding ids, owner, depends on, target date (agreed, or "to agree"), acceptance criterion. Separate immediate containment from the durable fix.>

## 8. Retest results and appendices

<Retest outcomes so far (or "no retest yet"), then appendices: the test environment once for every finding (build, config changes, accounts and permissions, seeded data, helpers written), the evidence index (id → what it is), raw tool output summaries, tool versions, and the full list of exposures with their tested states.>
```

## What each section gives the reader

| Section | The reader can then |
|---|---|
| Executive assessment | decide what to fund and what to stop |
| Scope and limitations | know exactly what the conclusions cover |
| System and threat context | see where the boundary is and who is outside it |
| Coverage and approach | judge how much weight an absence of findings carries |
| Principal attack narratives | understand the worst realistic outcome |
| Findings | reproduce, fix and verify each issue |
| Remediation roadmap | plan the work and know when it is done |
| Retest and appendices | check closure and trace every claim to its evidence |
