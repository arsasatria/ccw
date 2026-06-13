---
sidebar_position: 3
---

# ccw status

Show the current status of the Claude Code Wrapper server.

## Usage

```bash
ccw status
```

## Output

### Running Server

When the server is running:

```
Claude Code Wrapper Status: Running
Version: 2.0.0
PID: 12345
Port: 8080
Uptime: 2h 34m
Configuration: /home/user/.ccw/config.json
```

### Stopped Server

When the server is not running:

```
Claude Code Wrapper Status: Stopped
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Server is running |
| 1 | Server is stopped |
| 2 | Error checking status |

## Examples

```bash
$ ccw status

Claude Code Wrapper Status: Running
Version: 2.0.0
PID: 12345
Port: 8080
Uptime: 2h 34m
```

## Related Commands

- [ccw start](/docs/cli/start) - Start the server
- [ccw stop](/docs/cli/other-commands#ccw-stop) - Stop the server
- [ccw restart](/docs/cli/other-commands#ccw-restart) - Restart the server
