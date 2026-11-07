# Finding template: a write-up a team can follow

Use this shape for a single-finding report, and for each finding inside an assessment. Write it so someone who was not in the session can understand the issue, stand up the same environment, reproduce the issue in minutes, and check the fix, without asking you anything.

`bravos report check` reads the `**Status:**` and `**Severity:**` lines, and looks for the parts below either as a heading or as a bold `**Label:**` line. Use the headings. They read better than a wall of labels.

```markdown
# <Who can do what to what, in plain words: "Any namespace Writer can forge the result of a Nexus operation it did not start">

**Status:** reproduced at runtime, on <which setup> (see Evidence)
**Severity:** high
**Affects:** <product, version or commit tested; what was reviewed versus what was run>
**Tested by:** <name>, <date>, on <where: a local test server at 127.0.0.1>

## In short
<Three or four sentences a non-specialist can follow: what the feature does, what goes wrong, who can do it, what they get. End with how quickly it reproduces.>

## What the attacker wants, and what they need
**Attacker intent.** <What a real attacker would use this for, in business terms: two or three concrete examples.>
**What the attacker needs:** <role and permission, the identifiers they need and how they get them, network position, configuration preconditions.>
**What the attacker does not need:** <admin rights, secrets, special network access — say it, it is what makes the finding matter.>

## Why this is a vulnerability
<The promise the system makes, and how it is broken. If the team has declined similar issues before, say plainly why this one is different.>

## What we found
<Each weakness as a numbered item: one plain sentence of what is wrong, then *Code:* file:line and the function. Mention related observations as such, not as separate claims.>

## How the issues chain, step by step
<Numbered steps from the attacker's first action to the impact, each naming which weakness it uses.>

## Impact
**What we showed:** <only what a run demonstrated>
**What follows from the code but we did not run:** <supported by analysis>
**What is limited:** <boundaries that held, prerequisites that cap it>
**Severity: <level>.** <Why, in context. A CVSS line, if any, with its version and full vector.>

## Test environment: how it was set up
<Numbered, copy-pasteable: how the product was built, every config change with the exact snippet, dynamic or feature flags, how keys and accounts were made, what was seeded (tenants, namespaces, endpoints, users), and any helper you wrote to test it (a stub handler, a gRPC client or worker): what it does and how to install and run it. Point to the copies of the config files kept with the evidence.>

## Roles and permissions used
| Account | Permission | Used for | Result |
|---|---|---|---|
<one row per identity: the attacker's, the controls (anonymous, read-only, another tenant), the setup-only admin>

## Reproduce it with cxg
1. Install: `cargo install cert-x-gen` (and what the template needs, e.g. Python 3); `cxg --version`.
2. The template: where it is; `cxg template validate <file>`.
3. The environment variables it reads, one per line, with what each is.
4. The exact command, e.g. `cxg scan --scope http://<host>:<port> --templates <file> --timeout 120 --output <name> --output-format json` (give the scope as a URL with its port).
5. The expected output, quoted from a real run, with the line that proves it marked.

## Reproduce it by hand
<Numbered granular steps: each request as a copy-pasteable command (curl, a short script), the response to expect after each, and the controls that must fail (anonymous, read-only, another tenant, a garbage input). Any helper script in full.>

## What held
<Controls that worked: they tell the team what not to break while fixing.>

## How to fix it, and how to check the fix
**Fix:** <numbered changes at the cause, with the function names>
**Check:** <the replay that must now fail, the legitimate path that must still work>

## Evidence
**Status:** <the evidence label word for word> (<the evidence ids from bravos report data>).
<Where the run output, templates, scripts and config copies are; what each file shows. Keys and tokens are never included.>
```

## Rules

- **Title:** who can do what to what. "Broken access control in X" is a category, not a title.
- **Status:** one of the four labels, word for word: `reproduced at runtime`, `control held at runtime`, `established by code or configuration review`, `suspected, awaiting validation`. The `## Evidence` section repeats it with the evidence ids; the top line may say "(see Evidence)". Never claim more than the cited ids support.
- **Evidence ids** (`RUN-1/F-1`, `LED-…`, `EXP-…`) belong in the Evidence section, not in the prose. In the body, say "reproduced on our test server" and let the reader find the proof at the end.
- **Commands are exact.** Real ports, real paths, real flag spellings, environment variables named. Tokens appear as `$WRITER`, never as values. Run each command, or say plainly which one was not run.
- **The cxg reproduction** is a template the team can run unchanged. When the issue is proven by a script, turn the script into a cxg template (bravos-templatize) and replay it (bravos-prove, with the person's authorization) before you quote its output.
