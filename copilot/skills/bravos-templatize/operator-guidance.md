# Operator guidance for cxg (this repository)

Copy to `.guardlink/operator-guidance.md`, fill in each section from what the code actually does,
and pass it to `cxg pentest run --skills-file .guardlink/operator-guidance.md`. cxg appends it to
its template-generation prompt (12k characters at most), so keep it factual and short.

## Framework and routing
<!-- e.g. Express 4 with routers mounted in src/server.ts; Next.js app router under app/api -->

## Authentication shape
<!-- How a session is carried (cookie name, bearer header), where login lives, how roles and tenants are encoded -->

## Test identities and fixtures
<!-- The profiles bravos-env captured and what each may do; seed data a check can rely on -->

## Known false positives
<!-- Responses that look like a finding but are not: a 200 login page on auth failure, a soft 404, an echo endpoint -->

## Out of bounds
<!-- Routes and behaviours no probe may touch, whatever the scope allows -->
