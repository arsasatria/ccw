<div align="center">

# ccw

### Run Claude Code on any model.

An open-source gateway, distributable presets, and a live statusline — for developers who want Claude Code without being locked to one provider.

[Install](#install) · [Quick start](#quick-start) · [Presets](#presets) · [CLI](#cli) · [Web UI](#web-ui) · [Docs](https://ccw.dev/docs)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A58-F69220)](package.json)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)](#install)

</div>

---

## Why ccw

Claude Code is the best AI coding client. ccw is the layer that makes it yours:

- **One client, every model.** Run Claude Code against OpenAI, Anthropic, Gemini, Groq, OpenRouter, Azure, Ollama, Volcengine — or any HTTP endpoint you can describe. No fork, no patch, no waiting on a release.
- **Per-task routing.** Send long-context work to a 1M-token model, thinking to a reasoning model, background chores to a cheap fast one. ccw picks the right model for each kind of work, automatically.
- **Presets you can share.** A preset is a folder you can commit, version, and hand to a teammate. Marketplace or local — one command to install, one command to switch.
- **A statusline that tells the truth.** Live model, live token spend, live cost — surfaced inside Claude Code, not buried in a JSON log.
- **A web UI for the rest.** Manage providers, route rules, transformers, and presets in a panel that looks like a control deck, not a settings dump.

## What ccw is

ccw is a small local server that sits between Claude Code and your LLM providers.

```
┌──────────────────┐     Anthropic-format      ┌──────────────────┐
│  Claude Code     │  ───────────────────────► │       ccw        │
│  (the client)    │  ◄───────────────────────  │  local gateway   │
└──────────────────┘   SSE streaming response   └────────┬─────────┘
                                                         │
                                       per-request routing & format
                                                         │
                          ┌─────────────────┬────────────┼────────────┬──────────────┐
                          ▼                 ▼            ▼            ▼              ▼
                       OpenAI           Anthropic      Gemini         Groq        your endpoint
```

When Claude Code wants to call a model, it talks to ccw. ccw:

1. Decides which provider and model should answer this request — based on the request kind (default / background / think / longContext / webSearch) and your routing rules.
2. Translates the Anthropic-format request into whatever shape the target provider speaks (OpenAI Chat Completions, OpenAI Responses, Gemini, raw HTTP, etc.).
3. Streams the response back to Claude Code in the format it expects, translating along the way and patching provider quirks.

All of this happens locally, on your machine, in milliseconds.

## Install

Pick the platform:

**macOS / Linux**

```bash
curl -fsSL https://ccw.dev/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://ccw.dev/install.ps1 | iex
```

The installer verifies Node ≥ 20, enables pnpm via corepack, clones the source, builds it, and drops a `ccw` shim on your PATH. Re-running it is safe — it acts as an updater.

Pre-built binaries and Docker images: see the [release page](https://github.com/arsasatria/ccw/releases).

## Quick start

```bash
# 1. Start the local gateway
ccw start

# 2. Open the web UI to add a provider and pick models
ccw ui

# 3. Use Claude Code as usual — it now flows through ccw
ccw code "Refactor the auth module to use jose instead of jsonwebtoken"
```

The first time you run `ccw code`, ccw writes a settings file pointing Claude Code at `http://127.0.0.1:<port>` and `exec`s the client. From then on, your normal `claude` invocations can be replaced with `ccw code` — or you can `eval "$(ccw activate)"` to point your shell at ccw permanently.

### Try a preset

```bash
# Install a preset from the marketplace
ccw install gpt-4o

# Use it
ccw gpt-4o "Explain this regex"
```

A preset bundles a provider config, a routing policy, and (optionally) a statusline theme. Switch presets as easily as switching directories.

## Features

### Provider-agnostic

- OpenAI (Chat Completions + Responses)
- Anthropic (passthrough and SDK-compatible)
- Google Gemini
- Groq
- OpenRouter
- Azure OpenAI
- Ollama (local models)
- Volcengine
- Any HTTP endpoint via custom transformer

### Per-task routing

ccw classifies each request as one of five kinds and routes it independently:

| Kind          | Used for                                          | Default routing intent  |
|---------------|---------------------------------------------------|-------------------------|
| `default`     | Regular user prompts                              | best general model      |
| `background`  | Sub-tasks, hooks, async work                      | fast & cheap            |
| `think`       | Extended reasoning / chain-of-thought             | strong reasoning model  |
| `longContext` | Prompts that exceed a context window              | long-context model      |
| `webSearch`   | Built-in web search tool                          | model with search tool  |

You can override any of these per model id, per provider, or per request.

### Distributable presets

A preset is a folder containing a `manifest.json`. It can carry:

- A complete `Providers` list
- A `Router` policy
- A `StatusLine` configuration
- A list of `transformers` to enable
- A typed input schema (so the installer prompts for API keys, regions, etc.)
- A README and a logo

`ccw preset export` turns your current config into a preset. `ccw install <name>` pulls one from a GitHub marketplace. `ccw <name> "..."` uses it.

### Live statusline

`ccw statusline` is a stdin/stdout renderer for the Claude Code statusline hook. It shows, in real time, the working directory, the git branch, the active model, the token spend, the cost, the duration, and the lines changed. Themes: `default`, `powerline`, `simple`.

### Web UI

A control deck for everything that the CLI can do, plus a few things it can't:

- Visual provider editor with model pickers
- Router map showing the five task kinds and where they go
- Transformer chain inspector
- Preset marketplace browser
- Live log tail with filters
- Request debugger (Monaco + replay)

`ccw ui` starts the server (if needed) and opens the panel in your default browser.

### Plugin transformers

The gateway is built from a chain of small transformers. Each one is a request/response middleware that you can mix, match, and override:

```
auth → transformRequestIn → transformRequestOut → [provider] → transformResponseIn → transformResponseOut
```

Ship your own as a TypeScript file, drop it in `~/.ccw/transformers/`, reference it from a provider's `transformer.use` chain. ~20 built-in transformers cover format translation, reasoning, sampling, caching, and tool-use enhancement.

## How it works

ccw has four moving parts:

| Part                | Path                              | Purpose                                       |
|---------------------|-----------------------------------|-----------------------------------------------|
| **Core** (`@ccw/core`)      | `packages/core/src/`        | Transformers, provider registry, router       |
| **Server** (`@ccw/server`)  | `packages/server/src/`      | Fastify HTTP server, request lifecycle        |
| **CLI** (`@ccw/cli`)        | `packages/cli/src/`         | The `ccw` command and all subcommands         |
| **UI** (`@ccw/ui`)          | `packages/ui/src/`          | React 19 + Tailwind dashboard                 |

The CLI spawns and supervises the server (pid file at `~/.ccw/.ccw.pid`, logs at `~/.ccw/logs/`). The server holds config in memory and routes every request through the transformer chain. The UI talks to the same server over its REST API.

## Configuration

Config lives at `~/.ccw/config.json`. Edit by hand, edit in the UI, or `ccw model` for an interactive picker. A minimal config:

```json
{
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1",
      "api_key": "$OPENAI_API_KEY",
      "models": ["gpt-4o", "gpt-4o-mini"]
    },
    {
      "name": "anthropic",
      "api_base_url": "https://api.anthropic.com",
      "api_key": "$ANTHROPIC_API_KEY",
      "models": ["claude-sonnet-4-6", "claude-opus-4-7"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4o",
    "background": "openai,gpt-4o-mini",
    "think": "anthropic,claude-opus-4-7",
    "longContext": "anthropic,claude-sonnet-4-6",
    "webSearch": "openai,gpt-4o"
  }
}
```

Environment variables are interpolated into string values with `$VAR` syntax. After any change, run `ccw restart`.

Full reference: see `docs/cli/config/` in this repo.

## CLI

```
ccw [command] [preset-name]

Commands
  start         Start the local gateway
  stop          Stop the local gateway
  restart       Restart the local gateway
  status        Show gateway status
  statusline    Run the integrated statusline (stdin → stdout)
  code          Launch the AI client through ccw
  model         Interactive provider/model picker (writes config)
  preset        Manage presets (export, install, list, delete, info)
  install       Install a preset from the marketplace
  activate      Print shell env vars (eval "$(ccw activate)")
  ui            Open the web UI in the default browser
  update        Self-update from the source repository
  -v, version   Show version
  -h, help      Show help

Presets
  Any preset directory in ~/.ccw/presets/

Examples
  ccw start
  ccw code "Write a hello world in Go"
  ccw my-preset "Refactor the auth module"
  ccw model
  ccw preset export my-config
  ccw install gpt-4o
  eval "$(ccw activate)"
  ccw ui
```

## Presets

A preset is the unit of distribution. The shape:

```
my-preset/
├── manifest.json     # name, version, schema, config
├── README.md         # human-readable description
└── logo.svg          # optional
```

`manifest.json` is a regular config bundle plus:

- `inputs[]` — typed fields the installer prompts for (api keys, regions, etc.). Supports `string`, `secret`, `number`, `boolean`, `select`, and `multiselect`.
- `when` — conditional inputs that only appear based on other answers.
- `template` — `#{var}` placeholders that interpolate input values into the config.
- `configMappings` — how each input maps onto the final config.

Workflow:

```bash
# 1. Build a config you like
ccw model

# 2. Export it as a preset
ccw preset export my-preset

# 3. Push it to a GitHub repo
cd ~/.ccw/presets/my-preset
git init && git add . && git commit -m "initial"
gh repo create my-presets --public --source=. --push

# 4. Install it on another machine
ccw install my-preset
```

Marketplaces are just GitHub repositories with a `presets/` folder. The `ccw install` command walks that folder, lists everything it finds, and lets the user pick.

## Troubleshooting

**`ccw code` hangs at "Service startup timeout".**
Another instance is bound to the port. Check `~/.ccw/.ccw.pid` and `ccw stop`. If the PID file is stale, delete it and start again.

**`ccw update` says "Already up to date" but the binary is old.**
Your local clone diverged from the remote. `ccw update` does `git pull --ff-only`; if that fails it falls back to fetch+reset. You can also re-run the [installer](#install) — it is safe to re-run.

**Errors from a provider come back as cryptic SDK messages.**
The Anthropic SDK reframes mid-stream errors as "Content block is not a text block" when an error event arrives while a content block is still open. ccw patches this in the streaming layer and also logs the real provider error to `~/.ccw/logs/`. If you see the cryptic message, check the latest `ccw-*.log` for the underlying cause.

**The web UI won't load.**
Check `ccw status`. If the server is up but the UI is blank, your browser may be caching an old build — hard-reload with `Cmd/Ctrl+Shift+R`.

**A specific provider keeps 400-ing on tool calls.**
Most likely an orphan `tool_use` (a tool call in history with no following `tool_result`) or an empty function name/parameters. ccw filters these out by default; if you bypass that filter with a custom transformer, you will need to handle them yourself.

## Contributing

- Issues and feature requests: GitHub Issues
- Pull requests: fork, branch, run `pnpm install && pnpm build`, send the PR
- Preset contributions: publish a GitHub repo and add it to the marketplace index

Please run `pnpm lint` and `pnpm build` before sending a PR. New transformers should ship with tests in `packages/core/src/transformer/__tests__/`.

## Project status

ccw is a working, opinionated tool. The core (router, transformers, statusline) is stable. The web UI and the preset marketplace are actively evolving. Expect breaking changes to the preset `manifest.json` schema in pre-1.0 releases.

## License

[MIT](LICENSE)

## Acknowledgements

ccw stands on the shoulders of [Claude Code](https://docs.claude.com/en/docs/claude-code), the [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), [Fastify](https://fastify.dev/), [Vite](https://vitejs.dev/), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), and [Radix UI](https://www.radix-ui.com/). Thanks to the maintainers of every upstream dependency.
