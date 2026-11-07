# Bravos plugins

Bravos 1.0.3 for the coding agent you already use. Each plugin carries the same 14
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
