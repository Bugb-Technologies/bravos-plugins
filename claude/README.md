# Bravos plugins

Bravos 1.1.0 for the coding agent you already use. Each plugin carries the same 14
skills and the guardlink MCP server; the session-start briefing loads by itself
where the agent supports it.

**First, install the CLI** (Node 20 or newer). The skills drive it:

```bash
npm install -g @bugb-technologies/bravos
```

Then install the plugin for your agent:

| Agent | Install |
| --- | --- |
| Claude Code | `claude plugin marketplace add Bugb-Technologies/bravos-plugins` then `claude plugin install bravos@bravos` |
| Codex | `codex plugin marketplace add Bugb-Technologies/bravos-plugins` then `/plugins` in Codex and install Bravos |
| GitHub Copilot CLI | `copilot plugin marketplace add Bugb-Technologies/bravos-plugins` then `copilot plugin install bravos@bravos` |
| VS Code (agent plugins) | add `Bugb-Technologies/bravos-plugins` to `chat.plugins.marketplaces`, then install Bravos from the Agent Customizations view |
| Gemini CLI | `gemini extensions install https://github.com/Bugb-Technologies/bravos-plugins` |
| Antigravity | `agy plugin install https://github.com/Bugb-Technologies/bravos-plugins` |
| Cursor (Teams and Enterprise) | Dashboard → Plugins → Import from Repo → `https://github.com/Bugb-Technologies/bravos-plugins` |

You do not need a plugin: `bravos init` in a repository installs the same skills,
hooks and MCP wiring for every agent it finds, and commits them with the code.

## Where data goes

Bravos runs on your machine. Its skills, its session hook and the CLI they call
reach only these places:

- **account.bugb.io:**
  - `bravos account activate` signs this machine in once, in the browser. The
    portal records the machine under its name (its hostname), so you and your
    team's owners and admins can see it and sign it out.
  - While the machine is signed in, Bravos renews its licence there automatically,
    every few days: the session hook or the CLI sends the machine's secret, and the
    portal records the time, your CLI version and a one-way digest of your IP
    address. Licences for CI and licences imported from a file are never renewed.
  - `bravos setup` downloads the SAST analyzer and the code graph with your licence.

  Your licence and machine details go there; your code does not.
- **GitHub:** the session briefing uses `gh`, if it is installed and signed in, to
  list open pull requests in your repository. The CI workflows `bravos sync --ci`
  writes run on GitHub Actions in your own repository.
- **A test target you own:** `bravos-prove` and `bravos-recheck` send test
  requests through cxg. Loopback by default; any other host only with a reviewed
  `.guardlink/scope.yaml` and your own typed authorization naming it.
- **A model API, only if you agree:** cxg can generate probes through a model API
  you configure. The skill asks before it spends.
- **npm and crates.io:** `bravos setup --tools` installs guardlink and cxg.

The threat model, test results and reports stay in your repository. Bugb keeps
nothing from your sessions.

## Plans

The research loop is free for one researcher in one repository. The pre-PR gate
and autopilot, CI and nightly workflows, scheduled upkeep, workspaces, campaigns,
SAST and the code graph are on the Team plan: `bravos account activate` starts a
30-day trial with no card. See [how licensing works](https://docs.bugb.io/bravos/concepts/how-licensing-works/).

## Docs

[docs.bugb.io/bravos](https://docs.bugb.io/bravos/)

## Licence

Bravos Software Licence: see [LICENSE](LICENSE). This repository is generated from
the Bravos release; changes go into Bravos itself, not here.
