---
sidebar_position: 2
---

# ccw model

Interactive model selection and configuration.

## Usage

```bash
ccw model [command]
```

## Commands

### Select Model

Interactively select a model:

```bash
ccw model
```

This will display an interactive menu with available providers and models.

### Set Default Model

Set the default model directly:

```bash
ccw model set <provider>,<model>
```

Example:

```bash
ccw model set deepseek,deepseek-chat
```

### List Models

List all configured models:

```bash
ccw model list
```

### Add Model

Add a new model to configuration:

```bash
ccw model add <provider>,<model>
```

Example:

```bash
ccw model add groq,llama-3.3-70b-versatile
```

### Remove Model

Remove a model from configuration:

```bash
ccw model remove <provider>,<model>
```

## Examples

### Interactive selection

```bash
$ ccw model

? Select a provider: deepseek
? Select a model: deepseek-chat

Default model set to: deepseek,deepseek-chat
```

### Direct configuration

```bash
ccw model set deepseek,deepseek-chat
```

### View current configuration

```bash
ccw model list
```

Output:

```
Configured Models:
  deepseek,deepseek-chat (default)
  groq,llama-3.3-70b-versatile
  gemini,gemini-1.5-pro
```

## Related Commands

- [ccw start](/docs/cli/start) - Start the server
- [ccw config](/docs/cli/other-commands#ccw-config) - Edit configuration
