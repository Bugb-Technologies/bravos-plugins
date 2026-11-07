---
name: bravos-env
description: "Bring up a test target the user owns and prepare it for an authorized cxg run, under bravos's governance: loopback by default, a committed and reviewed scope.yaml, the human's own typed authorization, and a real session captured or imported, never invented. Use before bravos-prove or a template replay, when asked to stand up a test environment, seed test users or roles, or capture an auth session."
---
<!-- bravos:generated -->

> Paths that start with `SKILL_DIR/` are files in this skill's own folder, the folder that holds this SKILL.md.
# Bravos env: a target the user owns, ready for an authorized run

## When

- bravos-prove or bravos-recheck needs a running target and none is up.
- The user asks to start the app for testing, seed test users, roles or orgs, or capture a login session.
- A run was refused at pre-flight (cxg exit 4) or stopped on a dead session (exit 5).

## Do

1. Decide the target with the user. The default is the app running on this machine at a loopback address (`127.0.0.1`, `localhost`, `[::1]`). Start it with the repo's own tooling (its compose file, dev server script or desktop build) and wait until it answers. In a bravos workspace each service has its own target: take the URLs from `bravos workspace show` (set a missing one with `bravos workspace target <name> <service>=http://127.0.0.1:<port>`), bring up every service the test crosses, and list every service host in the reviewed scope's `host_allowlist`.
2. On loopback, a recorded proving preference (`.guardlink/proving.md`, `choice: auto`) is the person's go-ahead for its target: start it with the recorded command and do not ask again. If the user names a non-loopback target, stop and get two things before going on: the host listed in a committed `scope.yaml` that has been through a reviewed PR, and the human's authorization typed by them in this session in their own words. Without both, the target is out of scope; say so and stay on loopback.
3. Write the scope. Copy `SKILL_DIR/scope.example.yaml` to `.guardlink/scope.yaml`, or run `cxg pentest scope-init -o .guardlink/scope.yaml` for the full field reference, then narrow `url_allowlist` to the routes under test. `method_allowlist` is a strict bound: cxg refuses every method it does not list, even with `--destructive-ok`, so a test that needs PUT, PATCH or DELETE needs the target's owner to add them in the reviewed PR; never add them yourself. scope-init pre-fills `authorization_attestation` with an example sentence: blank it. Leave that field for the human to fill. Commit it and ship it as a PR for review before any non-loopback run.
4. Seed test data with the repo's own fixtures, seed scripts or admin endpoints: the roles and users the threats need, such as two users of different tenants for an ownership check. Name any test that needs production-like data as such, and run it only where that data is synthetic.
5. Get a session. On loopback, do it yourself: create the test accounts through the app's own signup, seed script or admin endpoint, write their email and password to a gitignored file under `.bravos/`, and log in with `cxg pentest auth --target <url> --profile <name> --creds-file <file> --login-path <login route>`, one profile per identity a check needs. If the app's login is not a JSON POST, drive the signup and login in your own browser tool and capture the session interactively with `cxg pentest auth --target <url> --profile <name>`. For an authorized non-loopback target, ask the human to capture the session in their own browser with the same command, or to paste a storage state you import with `cxg pentest auth import --storage-state <file> --profile <name> --target <url>`; CI uses the import with a session the human exported once.
6. Confirm each session is live with `cxg pentest auth verify --profile <name>` before handing the target on, so a run never spends its budget unauthenticated.
7. Record the target URL, the profile names, the scope path and whether the target is loopback, and hand them to bravos-prove.

## Never

- Invent, guess or brute-force a credential, token or session. Use accounts you created through the app on loopback, or a session the human captured or pasted for any other target.
- Create accounts or log in yourself on a non-loopback target, or commit the test-account credentials file.
- Point any run at a host that is not loopback unless it is in a committed, reviewed `scope.yaml` and the human typed their authorization in this session.
- Write the `authorization_attestation` text yourself or paraphrase the human's words into it.
- Record a proving preference the person did not state; `.guardlink/proving.md` quotes their words and never covers a non-loopback target.
- Enable destructive probe classes against anything but a disposable loopback target, or add a `disposable_host_grants` entry.
- Seed or test against real user data.
- Write `@accepts`, `@entitles` or `@confirmed`; this skill prepares a target and judges nothing.

## Done when

- A target answers, and it is loopback or it is covered by a reviewed scope plus the human's typed authorization.
- `.guardlink/scope.yaml` exists, is committed and leaves `authorization_attestation` to the human.
- Each profile bravos-prove needs passes `cxg pentest auth verify --profile <name>`.
- You told the user what you seeded and which tests need data that is not synthetic.

## What it leaves for the next skill

- The target URL, profile names, scope path and the loopback verdict, for bravos-prove and bravos-recheck.

## Go deeper

- `SKILL_DIR/scope.example.yaml` — the loopback starter and what each field limits.
- `SKILL_DIR/../bravos-prove/SKILL.md` — what happens with the target next.
