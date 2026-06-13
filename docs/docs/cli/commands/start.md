---
sidebar_position: 1
---

# ccw start

Start the Claude Code Wrapper server.

## Usage

```bash
ccw start [options]
```

## Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--port <number>` | `-p` | Port to listen on (default: 8080) |
| `--config <path>` | `-c` | Path to configuration file |
| `--daemon` | `-d` | Run as daemon (background process) |
| `--log-level <level>` | `-l` | Log level (fatal/error/warn/info/debug/trace) |

## Examples

### Start with default settings

```bash
ccw start
```

### Start on custom port

```bash
ccw start --port 3000
```

### Start with custom config

```bash
ccw start --config /path/to/config.json
```

### Start as daemon

```bash
ccw start --daemon
```

### Start with debug logging

```bash
ccw start --log-level debug
```

## Environment Variables

You can also configure the server using environment variables:

| Variable | Description |
|----------|-------------|
| `PORT` | Port to listen on |
| `CONFIG_PATH` | Path to configuration file |
| `LOG_LEVEL` | Logging level |
| `CUSTOM_ROUTER_PATH` | Path to custom router function |
| `HOST` | Host to bind to (default: 0.0.0.0) |

## Output

When started successfully, you'll see:

```
Claude Code Wrapper is running on http://localhost:8080
API endpoint: http://localhost:8080/v1
```

## Related Commands

- [ccw stop](/docs/cli/other-commands#ccw-stop) - Stop the server
- [ccw restart](/docs/cli/other-commands#ccw-restart) - Restart the server
- [ccw status](/docs/cli/other-commands#ccw-status) - Check server status
