---
sidebar_position: 4
---

# Other Commands

Additional CLI commands for managing Claude Code Router.

## ccr stop

Stop the running server.

```bash
ccr stop
```

## ccr restart

Restart the server.

```bash
ccr restart
```

## ccr code

Execute a claude command through the router.

```bash
ccr code [args...]
```

## ccr activate

Output shell environment variables for integration.

```bash
ccr activate
```

Output:

```bash
export ANTHROPIC_API_URL="http://localhost:8080/v1"
export ANTHROPIC_API_KEY="sk-xxxxx"
```

To use in your shell:

```bash
eval "$(ccr activate)"
```

## ccr ui

Open the Web UI in your browser.

```bash
ccr ui
```

## ccr statusline

Integrated statusline (reads JSON from stdin).

```bash
echo '{"status":"running"}' | ccr statusline
```

## ccr config

Configuration management commands.

### Edit Configuration

```bash
ccr config edit
```

Opens the configuration file in your default editor.

### Validate Configuration

```bash
ccr config validate
```

Validates the current configuration file.

### Show Configuration

```bash
ccr config show
```

Displays the current configuration (with sensitive values masked).

## ccr preset

Preset management commands.

### List Presets

```bash
ccr preset list
```

### Apply Preset

```bash
ccr preset apply <name>
```

### Save Preset

```bash
ccr preset save <name>
```

## ccr log

View server logs.

```bash
ccr log [options]
```

Options:
- `-f, --follow`: Follow log output (like `tail -f`)
- `-n <lines>`: Number of lines to show

## Global Options

These options can be used with any command:

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help |
| `-v, --version` | Show version number |
| `--config <path>` | Path to configuration file |
| `--verbose` | Enable verbose output |

## Examples

### Stop the server

```bash
ccr stop
```

### Restart with custom config

```bash
ccr restart --config /path/to/config.json
```

### View and set environment variables

```bash
eval "$(ccr activate)"
```

### Open Web UI

```bash
ccr ui
```

### Follow logs

```bash
ccr log -f
```

## Related Documentation

- [Getting Started](/docs/intro) - Introduction to Claude Code Router
- [Configuration](/docs/config/basic) - Configuration guide
