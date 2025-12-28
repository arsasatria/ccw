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
- **Status Bar**: Integration into editor status bar

## Installation

```bash
npm install -g @arsasatria/ccw-cli
```

Or using project alias:

```bash
npm install -g ccw
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

### View Models

```bash
ccr model
```

## Integration with Claude Code

`ccr` integrates seamlessly with Claude Code to route requests to your chosen LLM provider.

### Method 1: Set API Address

```bash
export ANTHROPIC_BASE_URL="http://localhost:3456/v1"
export ANTHROPIC_API_KEY="your-api-key"
```

### Method 2: Use activate Command

```bash
eval "$(ccr activate)"
```

## Configuration File

`ccr` uses the same configuration file as Server: `~/.ccw/config.json`

Configure once, and both CLI and Server will use it.

## Next Steps

- [Installation Guide](/docs/cli/installation) - Detailed installation instructions
- [Quick Start](/docs/cli/quick-start) - Get started in 5 minutes
- [Command Reference](/docs/category/cli-commands) - Complete command list
- [Configuration Guide](/docs/category/cli-config) - Configuration file details
