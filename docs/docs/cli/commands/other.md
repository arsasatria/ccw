---
sidebar_position: 4
---

# Other Commands

Additional CLI commands for managing Claude Code Wrapper.

## ccw stop

Stop the running server.

```bash
ccw stop
```

## ccw restart

Restart the server.

```bash
ccw restart
```

## ccw code

Execute a claude command through the router.

```bash
ccw code [args...]
```

## ccw ui

Open the Web UI in your browser.

```bash
ccw ui
```

## ccw activate

Output shell environment variables for integration with external tools.

```bash
ccw activate
```

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
ccw stop
```

### Restart with custom config

```bash
ccw restart --config /path/to/config.json
```

### Open Web UI

```bash
ccw ui
```

## Related Documentation

- [Getting Started](/docs/intro) - Introduction to Claude Code Wrapper
- [Configuration](/docs/config/basic) - Configuration guide
