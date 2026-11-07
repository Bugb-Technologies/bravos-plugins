// @comment -- "bravos's pre-PR gate entry, two ways. As the opt-in PreToolUse hook it reads the hook payload from stdin, gates only Bash commands that run gh pr create or gh pr ready, and exits 2 with the reason on stderr to block; every other command, unparseable input and BRAVOS_PRE_PR=off exit 0. Run by hand (--check, or no stdin / a TTY) it gates the current branch before any PR exists: exit 2 on lint errors, a confirmed claim on a changed file without a @ticket, or an input that fails; new exposures are printed to disclose, not blocked on. The repo root is git's top level for the working directory, never the payload cwd as given."
import { entitled, refusal, status as licenceStatus } from './lib/licence.mjs';
import { prAction, resolveRoot, runGate } from './lib/pre-pr.mjs';

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function finish({ decision, reason }, check) {
  if (decision === 'block') {
    process.stderr.write(reason + '\n');
    process.exit(2);
  }
  if (check) process.stdout.write((reason ? reason + '\n' : '') + 'bravos pre-PR gate: pass\n');
  else if (reason) process.stderr.write(reason + '\n');
  process.exit(0);
}

async function main() {
  const env = process.env;
  if (env.BRAVOS_PRE_PR === 'off') process.exit(0);
  // Without a Team licence the gate stands down: one line on stderr (never a block), so a teammate
  // without a seat still opens their PR and knows why nothing was checked.
  const lic = licenceStatus(env);
  if (!entitled(lic, 'pre-pr')) {
    process.stderr.write(`bravos pre-PR gate: skipped — ${refusal(lic, 'pre-pr', 'the pre-PR gate')}\n`);
    process.exit(0);
  }
  let check = process.argv.includes('--check') || process.stdin.isTTY === true;
  let raw = '';
  if (!check) {
    raw = await readStdin();
    if (raw.trim() === '') check = true;
  }
  if (check) {
    const cwd = process.cwd();
    finish(runGate({ root: resolveRoot(cwd, env), cwd, action: 'check', command: '', env }), true);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const command = input?.tool_input?.command;
  const action = prAction(command);
  if (!action) process.exit(0);
  const cwd = input?.cwd || env.CLAUDE_PROJECT_DIR || process.cwd();
  finish(runGate({ root: resolveRoot(cwd, env), cwd, action, command, env }), false);
}

main();
