---
title: CLI Introduction
---

# CLI Introduction

Claude Code Router CLI (`ccr`) is a command-line tool for managing and controlling the Claude Code Router service.

## Feature Overview

`ccr` provides the following functionality:

- **Service Management**: Start, stop, restart service
- **Configuration Management**: Interactive model selection configuration
- **Status Viewing**: View service running status
- **Code Execution**: Directly execute `claude` command
- **Environment Integration**: Output environment variables for shell integration
- **Web UI**: Open Web management interface
- **Status Bar**: Display customizable session status with `ccr statusline`

## Installation

```bash
npm install -g @arsasatria/ccw
```

## Basic Usage

### Start Service

```bash
ccr start
```

### View Status

```bash
ccr status
```

### Stop Service

```bash
ccr stop
```

## Configuration File

`ccr` uses the same configuration file as Server: `~/.ccw/config.json`

Configure once, and both CLI and Server will use it.

## Next Steps

- [Installation Guide](/docs/cli/installation) - Detailed installation instructions
- [Quick Start](/docs/cli/quick-start) - Get started in 5 minutes
- [Command Reference](/docs/category/cli-commands) - Complete command list
- [Status Line](/docs/cli/commands/statusline) - Customize your status bar
- [Configuration Guide](/docs/category/cli-config) - Configuration file details
