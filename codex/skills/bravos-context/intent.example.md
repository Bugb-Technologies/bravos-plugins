# Intent — <product name>

What the software is for and what it intends. For a researched project this comes from upstream's
own docs, with each source cited; for your own product, from you. bravos-annotate judges every
claim against this file. Each item ends with how it was decided — `— suggested by bravos,
accepted by <names>`, `— edited by <names>`, `— chosen by <names>` or `— draft`; change a decided
line by appending a dated note beneath it, never by rewriting it.

## Assumptions (researched projects: what severities are rated against)

- Configuration: <shipped defaults | upstream's recommended hardened setup | both, rated separately> — set by <names>, <date>
- Deployment: <single organisation | multi-tenant | both> — set by <names>, <date>
- Attackers in scope: <e.g. unauthenticated network, authenticated tenant, malicious worker, compromised peer>; out of scope: <e.g. internal network, operator> — set by <names>, <date>

## Purpose

- <One or two sentences: what it does, for whom, who pays.> — draft

## Actors

- <Role, e.g. Customer: signs up, places orders, sees only their own account.> — draft
- <Role, e.g. Tenant admin: manages users inside one organisation.> — draft
- <Role, e.g. Operator: internal staff with support tooling.> — draft

## Crown jewels

- <Asset and data class, e.g. Payment records (financial).> — draft
- <e.g. Customer profiles (pii).> — draft

## Invariants (must never happen)

- INV-1: <e.g. A user never reads or changes another tenant's data.> — draft
- INV-2: <e.g. A refund is never issued without an approved order.> — draft
- INV-3: <e.g. No role can grant a role above its own.> — draft

## Intended by design (looks dangerous, is the product)

- INT-1: <e.g. Operators can impersonate a customer for support; it is logged.> (upstream: <url or path>, or: upstream is silent) — draft
- INT-2: <e.g. The CLI runs user-supplied shell commands on the user's own machine.> — draft

## Trust boundaries

- <e.g. Public internet → API gateway (unauthenticated).> — draft
- <e.g. API → billing provider (third party).> — draft

## Changes

- <YYYY-MM-DD: what changed and who confirmed it.>
