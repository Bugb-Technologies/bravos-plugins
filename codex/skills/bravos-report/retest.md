# Retest template

Records whether a fix held. The original finding stays as it was; the retest is added beside it. Keep the four `##` headings and the bold labels; `bravos report check` reads them.

```markdown
# Retest — F-03 Organization members can download invoices belonging to another organization

## Retest summary

<One paragraph: fixed, partly fixed, or not fixed; on which build; what still remains exposed.>

## Original finding

<The original finding block, unchanged (finding.md shape), with its original evidence ids.>

## Retest

**Retested build:** commit <sha>, <environment>
**Replay:** <the original template or steps, rerun; the run id, e.g. RUN-7/X-1>
**Result:** control held at runtime (RUN-7/X-1, LED-89166523)
**Bypass variants:** <the variants tried — another role, another identifier format, the export path — and each outcome>
**Legitimate behaviour:** <the same-organization download still works, with its evidence id, or "not checked">

## Residual exposure

<What remains: related paths not yet fixed, variants not tried, or "none established". Name the next action.>
```

**Result** uses the same four evidence labels as findings: `control held at runtime` when the replay was refused, `reproduced at runtime` when the fix did not hold, and so on, followed by the ids.
