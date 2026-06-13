---
title: CLI Introduction
---

# CLI Introduction

Claude Code Wrapper CLI (`ccw`) is a command-line tool for managing and controlling the Claude Code Wrapper service.

## Feature Overview

`ccw` provides the following functionality:

- **Service Management**: Start, stop, restart service
- **Configuration Management**: Interactive model selection configuration
- **Status Viewing**: View service running status
- **Code Execution**: Directly execute `claude` command
- **Environment Integration**: Output environment variables for shell integration
- **Web UI**: Open Web management interface
- **Status Bar**: Display customizable session status with `ccw statusline`

## Installation

```bash
npm install -g @arsasatria/ccw
```

## Basic Usage

### Configuration

Before using Claude Code Wrapper, you need to configure your providers. You can either:

1. **Edit configuration file directly**: Edit `~/.ccw/config.json` manually
2. **Use Web UI**: Run `ccw ui` to open the web interface and configure visually

After making configuration changes, restart the service:

```bash
ccw restart
```

Or restart directly through the Web UI.

### Start Claude Code

Once configured, you can start Claude Code with:

```bash
ccw code
```

This will launch Claude Code and route your requests through the configured provider.

### Service Management

```bash
ccw start    # Start the router service
ccw status   # View service status
ccw stop     # Stop the router service
ccw restart  # Restart the router service
```

### Web UI

```bash
ccw ui       # Open Web management interface
```

## Configuration File

`ccw` uses the configuration file at `~/.ccw/config.json`

Configure once, and both CLI and Server will use it.

## Next Steps

- [Installation Guide](/docs/cli/installation) - Detailed installation instructions
- [Quick Start](/docs/cli/quick-start) - Get started in 5 minutes
- [Command Reference](/docs/category/cli-commands) - Complete command list
- [Status Line](/docs/cli/commands/statusline) - Customize your status bar
- [Configuration Guide](/docs/category/cli-config) - Configuration file details
