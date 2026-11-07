# Writing style for bravos reports

**The test:** someone who was not in the session can understand the issue, stand up the same environment, reproduce it in minutes, fix its cause and show closure, without asking the author what anything means.

The usual reader is a team: the product's own security or engineering team, or a vendor receiving a report. Write for them, not for bravos. A report that reads like a checklist, with evidence ids in every sentence, gets put down.

## Write it like this

- **Plain words first.** Explain the feature in one sentence before saying what is wrong with it. Use the product's own names (callback token, namespace, Writer), not bravos's (EXP-34, claim, asset).
- **Lead with the consequence.** The first paragraph says who can do what to whom, and how quickly it reproduces.
- **Say what the attacker wants.** Two or three concrete things a real attacker would do with this. Then what they need, and what they do not need: no admin, no secret, no special network position. That second list is often what makes a team accept the finding.
- **Tell the chain as numbered steps.** One step per action, each naming the weakness it uses.
- **Show the whole environment.** Name the build, every config change (with the snippet), feature flags, how keys and accounts were made, what was seeded, and every helper you wrote, such as a stub handler or a gRPC worker: what it does, and how to install and run it. If a step needs a file, say where the copy is.
- **List the roles in a table.** Who held which permission, what each was used for, and what happened. The controls that were refused belong in it too.
- **Give two ways to reproduce:**
  - **With cxg:** install with `cargo install cert-x-gen`, then the exact `cxg scan` command and the output to expect.
  - **By hand:** each request as a command, with the response to expect after it.
- **Separate what was shown from what follows.** "What we showed", "What follows from the code but we did not run", "What is limited". A "not reproduced" says what was tried.
- **Say why it is a vulnerability.** Name the promise the system makes and how it breaks. If similar issues were declined before, say why this one is different.
- **Name the controls that held.** They tell the team what not to break while fixing.
- **Keep severity and priority apart.** Severity is the technical consequence. Priority adds exposure and prerequisites. A CVSS line carries its version and full vector, and never stands alone.

## Avoid

- Evidence ids in the prose. They go in the Evidence section at the end.
- A wall of `**Label:**` lines. Use headings and short paragraphs.
- Jargon the reader has to look up, and bravos's internal names.
- Hedging a result you reproduced, and overstating one you did not.
- Filler: "it is important to note", restating a heading, apologising for length.
- Any live secret, token or password. Write `$WRITER`; cite where a secret is, never its value.

## The model paragraph

A fictional finding, abbreviated, in the voice to aim for:

> **Organization members can download invoices belonging to another organization**
>
> A standard member of Organization A downloaded an invoice that belongs to Organization B, just by sending its invoice number to the download endpoint. All they needed was a normal account and the invoice number.
>
> The download handler looks the invoice up by number alone. The invoice list does check the organization, which is why the problem never shows in the normal interface.
>
> We reproduced this with two test organizations. We did not establish whether invoice numbers can be guessed at scale.
>
> Fix: check the organization before returning the invoice. Then confirm that a foreign-organization request is refused, and that a same-organization download still works.
