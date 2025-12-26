---
sidebar_position: 3
---

# Quick Start

Get up and running with Claude Code Router in 5 minutes.

## 1. Start the Router

```bash
ccr start
```

The router will start on `http://localhost:8080` by default.

## 2. Configure Environment Variables

Set the following environment variables in your shell:

```bash
export ANTHROPIC_API_URL="http://localhost:8080/v1"
export ANTHROPIC_API_KEY="your-provider-api-key"
```

Or use the `ccr activate` command to get the environment variables:

```bash
eval "$(ccr activate)"
```

## 3. Use Claude Code

Now you can use Claude Code normally:

```bash
claude code
```

Your requests will be routed through Claude Code Router to your configured provider.

## 4. Configure Providers (Optional)

To configure multiple providers or custom routing, use:

```bash
ccr model
```

This will open an interactive menu to select and configure models.

Or edit the configuration file directly:

```bash
# Open config in your default editor
ccr config edit
```

Example configuration (`~/.ccw/config.json`):

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-deepseek-api-key",
      "MODELS": ["deepseek-chat", "deepseek-coder"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
}
```

## What's Next?

- [Basic Configuration](/docs/config/basic) - Learn about configuration options
- [Routing](/docs/config/routing) - Configure smart routing rules
- [CLI Commands](/docs/cli/start) - Explore all CLI commands
