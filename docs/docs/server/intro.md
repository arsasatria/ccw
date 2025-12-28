---
title: Server Introduction
---

# Server Introduction

Claude Code Router Server is a core service component responsible for routing Claude Code API requests to different LLM providers. It provides a complete HTTP API with support for:

- **API Request Routing**: Convert Anthropic-format requests to various provider API formats
- **Authentication & Authorization**: Support API Key authentication
- **Configuration Management**: Dynamic configuration of providers, routing rules, and transformers
- **Web UI**: Built-in management interface
- **Logging System**: Complete request logging

## Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│ Claude Code │────▶│ CCR Server       │────▶│ LLM Provider │
│   Client    │     │  (Router +       │     │  (OpenAI/    │
└─────────────┘     │   Transformer)   │     │   Gemini/etc)│
                    └──────────────────┘     └──────────────┘
                           │
                           ├─ Web UI
                           ├─ Config API
                           └─ Logs API
```

## Core Features

### 1. Request Routing
- Token-count-based intelligent routing
- Project-level routing configuration
- Custom routing functions
- Scenario-based routing (background, think, longContext, etc.)

### 2. Request Transformation
- Supports API format conversion for multiple LLM providers
- Built-in transformers: Anthropic, DeepSeek, Gemini, OpenRouter, Groq, etc.
- Extensible transformer system

### 3. Agent System
- Plugin-based Agent architecture
- Built-in image processing Agent
- Custom Agent support

### 4. Configuration Management
- JSON5 format configuration file
- Environment variable interpolation
- Hot configuration reload (requires service restart)

## Use Cases

### Scenario 1: Personal Local Service
Run the service locally for personal Claude Code use:

```bash
ccr start
```

### Scenario 2: Team Shared Service
Deploy using Docker to provide shared service for team members:

```bash
docker run -d -p 3456:3456 musistudio/ccw
```

### Scenario 3: Secondary Development
Build custom applications based on exposed APIs:

```bash
GET /api/config
POST /v1/messages
GET /api/logs
```

## Next Steps

- [Docker Deployment Guide](/docs/server/deployment) - Learn how to deploy the service
- [API Reference](/docs/category/api) - View complete API documentation
- [Configuration Guide](/docs/category/server-config) - Understand server configuration options
