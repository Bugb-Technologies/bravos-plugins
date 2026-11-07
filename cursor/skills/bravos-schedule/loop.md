# bravos security upkeep loop

Each iteration, in this session:

1. Read what changed since the last iteration: `git diff --name-only` against the commit the
   previous iteration ended on (on the first iteration, against the merge base with the default
   branch).
2. If any changed file is security-relevant and its claims are missing or stale, follow
   bravos-annotate with the diff playbook on those files only, and run its lint gate until it
   reports 0 errors.
3. Run bravos-ship's checks without opening anything: guardlink validate, lint since the merge
   base, and diff against the merge base. Report new exposure as open.
4. Print one line: files annotated, coverage before and after, lint errors, new exposures.

Never open or update a pull request, push, run a live test, or write `@accepts`, `@entitles` or
`@confirmed` from this loop. If nothing security-relevant changed, say so in one line and stop.
