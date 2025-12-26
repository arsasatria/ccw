---
sidebar_position: 3
---

# Presets

Use predefined configurations for quick setup.

## What are Presets?

Presets are pre-configured settings that include provider configurations, routing rules, and transformers optimized for specific use cases.

## Available Presets

### Development

Optimized for software development tasks:
- Fast response times
- Good for code generation
- Cost-effective

### Research

Optimized for research and analysis:
- Long context support
- High-quality responses
- More capable models

### Balanced

A balance between speed and quality:
- Good general-purpose performance
- Reasonable costs
- Wide model support

## Using Presets

Use the CLI to apply a preset:

```bash
ccr preset apply development
```

List available presets:

```bash
ccr preset list
```

## Creating Custom Presets

You can create custom presets by saving your configuration and reloading it later:

```bash
# Save current configuration as a preset
ccr preset save my-preset

# Load a saved preset
ccr preset apply my-preset
```

## Next Steps

- [CLI Reference](/docs/cli/start) - Complete CLI command reference
