---
sidebar_position: 2
---

# Agents

Extend functionality with the agent system.

## What are Agents?

Agents are pluggable feature modules that can:
- Detect whether to handle a request
- Modify requests
- Provide custom tools

## Built-in Agents

### Image Agent

Handles image-related tasks by detecting image URLs or file paths in requests.

## Agent Configuration

Agents are configured in the server configuration and automatically loaded.

## Agent Tool Call Flow

1. Detect and mark agents in `preHandler` hook
2. Add agent tools to the request
3. Intercept tool call events in `onSend` hook
4. Execute agent tool and initiate new LLM request
5. Stream results back

## Creating Custom Agents

Coming soon! Custom agent support is under development.

## Next Steps

- [Presets](/docs/advanced/presets) - Use predefined configurations
