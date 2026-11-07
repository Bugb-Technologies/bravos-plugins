import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// @comment -- "Reads .guardlink/proving.md, the person's recorded answer to how findings should be proven (written by the agent from their words in bravos-env/bravos-prove): choice auto | ask | schedule | none, the loopback target, the start command, whether model-API generation is allowed, and who confirmed it. Anything without a named confirmation reads as not set."
export function readProving(root) {
  let text;
  try {
    text = readFileSync(join(root, '.guardlink', 'proving.md'), 'utf8');
  } catch {
    return { status: 'not set' };
  }
  const field = (name) => text.match(new RegExp(`^${name}:\\s*(\\S[^\\n]*?)\\s*$`, 'mi'))?.[1]?.replace(/\s+\(.*\)$/, '') ?? null;
  const by = text.match(/—\s*confirmed by\s+([^,\n]+?)\s*,\s*(\S+)/i);
  const choice = (field('choice') ?? '').toLowerCase().split(/\s/)[0];
  if (!by || !['auto', 'ask', 'schedule', 'none'].includes(choice)) return { status: 'not set' };
  return {
    status: 'set',
    choice,
    target: field('target'),
    start: field('start'),
    generation: /^(yes|true|allowed)/i.test(field('generation') ?? ''),
    by: by[1],
    date: by[2],
  };
}
