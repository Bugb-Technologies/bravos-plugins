# Bravos

This extension adds the Bravos skills: the threat model as guardlink annotations,
authorized pentests with cxg, the code graph and SAST. Start with the `bravos`
skill. If no briefing is in context, run `bravos hook session-start --briefing`
once to print the repository's security picture.

The skills drive the `bravos` CLI (`npm install -g @bugb-technologies/bravos`),
`guardlink` and `cxg`. Never send a request to a host other than loopback
without a committed, reviewed `.guardlink/scope.yaml` and the user's own typed
authorization naming the target.
