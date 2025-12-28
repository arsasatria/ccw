---
sidebar_position: 3
---

# Presets

Use predefined configurations for quick setup.

## What are Presets?

Presets are pre-configured settings that include provider configurations, routing rules, and transformers optimized for specific use cases.

## Dynamic Configuration System (v2.0+)

CCR 2.0 introduces a powerful dynamic configuration system that supports:

- **Multiple Input Types**: Selectors, multi-select, confirm boxes, text input, number input, etc.
- **Conditional Logic**: Dynamically show/hide configuration fields based on user input
- **Variable References**: Configuration fields can reference each other
- **Dynamic Options**: Option lists can be dynamically generated from preset configuration or user input

### Schema Field Types

| Type | Description | Example |
|------|-------------|---------|
| `password` | Password input (hidden) | API Key |
| `input` | Single-line text input | Base URL |
| `number` | Number input | Max tokens |
| `select` | Single-select dropdown | Choose Provider |
| `multiselect` | Multi-select | Enable features |
| `confirm` | Confirmation box | Use proxy |
| `editor` | Multi-line text editor | Custom config |

### Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `{"field": "provider", "operator": "eq", "value": "openai"}` |
| `ne` | Not equals | `{"field": "advanced", "operator": "ne", "value": true}` |
| `in` | In (array) | `{"field": "feature", "operator": "in", "value": ["a", "b"]}` |
| `nin` | Not in (array) | `{"field": "type", "operator": "nin", "value": ["x", "y"]}` |
| `exists` | Field exists | `{"field": "apiKey", "operator": "exists"}` |
| `gt/lt/gte/lte` | Greater/less than (or equal) | For number comparisons |

### Dynamic Options Types

#### static - Static Options
```json
"options": {
  "type": "static",
  "options": [
    {"label": "Option 1", "value": "value1"},
    {"label": "Option 2", "value": "value2"}
  ]
}
```

#### providers - Extract from Providers Configuration
```json
"options": {
  "type": "providers"
}
```
Automatically extracts names from the `Providers` array as options.

#### models - Extract from Specified Provider's Models
```json
"options": {
  "type": "models",
  "providerField": "{{selectedProvider}}"
}
```
Dynamically displays models based on the user-selected provider.

### Template Variables

Use `{{variableName}}` syntax to reference user input in the template:

```json
"template": {
  "Providers": [
    {
      "name": "{{providerName}}",
      "api_key": "{{apiKey}}"
    }
  ]
}
```

### Configuration Mappings

For complex configuration needs, use `configMappings` to precisely control value placement:

```json
"configMappings": [
  {
    "target": "Providers[0].api_key",
    "value": "{{apiKey}}"
  },
  {
    "target": "PROXY_URL",
    "value": "{{proxyUrl}}",
    "when": {
      "field": "useProxy",
      "operator": "eq",
      "value": true
    }
  }
]
```

### Complete Example

```json
{
  "name": "multi-provider-example",
  "version": "1.0.0",
  "description": "Multi-provider configuration example - Switch between OpenAI and DeepSeek",
  "author": "CCR Team",
  "keywords": ["openai", "deepseek", "multi-provider"],
  "ccwVersion": "2.0.0",
  "schema": [
    {
      "id": "primaryProvider",
      "type": "select",
      "label": "Primary Provider",
      "prompt": "Select your primary LLM provider",
      "options": {
        "type": "static",
        "options": [
          {
            "label": "OpenAI",
            "value": "openai",
            "description": "Use OpenAI's GPT models"
          },
          {
            "label": "DeepSeek",
            "value": "deepseek",
            "description": "Use DeepSeek's cost-effective models"
          }
        ]
      },
      "required": true,
      "defaultValue": "openai"
    },
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "Enter your API Key",
      "placeholder": "sk-...",
      "required": true
    },
    {
      "id": "defaultModel",
      "type": "select",
      "label": "Default Model",
      "prompt": "Select the default model to use",
      "options": {
        "type": "static",
        "options": [
          {"label": "GPT-4o", "value": "gpt-4o"},
          {"label": "GPT-4o-mini", "value": "gpt-4o-mini"}
        ]
      },
      "required": true,
      "defaultValue": "gpt-4o",
      "when": {
        "field": "primaryProvider",
        "operator": "eq",
        "value": "openai"
      }
    },
    {
      "id": "enableProxy",
      "type": "confirm",
      "label": "Enable Proxy",
      "prompt": "Access API through a proxy?",
      "defaultValue": false
    },
    {
      "id": "proxyUrl",
      "type": "input",
      "label": "Proxy URL",
      "prompt": "Enter proxy server address",
      "placeholder": "http://127.0.0.1:7890",
      "required": true,
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      }
    }
  ],
  "template": {
    "Providers": [
      {
        "name": "{{primaryProvider}}",
        "api_base_url": "https://api.openai.com/v1",
        "api_key": "{{apiKey}}",
        "models": ["{{defaultModel}}"]
      }
    ],
    "Router": {
      "default": "{{primaryProvider}}/{{defaultModel}}"
    },
    "PROXY_URL": "{{proxyUrl}}"
  },
  "configMappings": [
    {
      "target": "PROXY_URL",
      "value": "{{proxyUrl}}",
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      }
    }
  ]
}
```

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

### Using the Dynamic Configuration System

Create a preset file with `schema` and `template`:

```bash
# Create preset directory
mkdir -p ~/.ccw/presets/my-preset

# Create manifest.json
cat > ~/.ccw/presets/my-preset/manifest.json << 'EOF'
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "My custom preset",
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "required": true
    }
  ],
  "template": {
    "Providers": [
      {
        "name": "my-provider",
        "api_key": "{{apiKey}}"
      }
    ]
  }
}
EOF

# Apply preset (will prompt for API Key)
ccr my-preset
```

You can also save and reload your current configuration:

```bash
# Save current configuration as a preset
ccr preset save my-preset

# Load a saved preset
ccr preset apply my-preset
```

## Preset Management

### List All Presets

```bash
ccr preset list
```

Output example:

```
Available presets:
  development    - Development optimized configuration
  research       - Research optimized configuration
  balanced       - Balanced configuration
  my-preset      - Custom preset
```

### Apply a Preset

```bash
ccr preset apply <preset-name>
```

The server will automatically restart to load the new configuration.

### Delete a Preset

```bash
ccr preset delete <preset-name>
```

## Preset File Location

Presets are stored in:

```
~/.ccw/presets/
```

Each preset is a directory containing a `manifest.json` file.

## Exporting and Importing Presets

### Export Current Configuration

```bash
ccr config show > my-config.json
```

### Import Configuration

```bash
ccr config edit
# Then paste the imported configuration
```

## Best Practices

1. **Use Dynamic Configuration**: Use the schema system for configuration items that require user input
2. **Provide Defaults**: Set reasonable defaults for optional fields
3. **Conditional Display**: Use `when` conditions to avoid unnecessary inputs
4. **Clear Labels**: Provide clear `label` and `prompt` for each field
5. **Validate Input**: Use `validator` to ensure input validity
6. **Version Control**: Keep commonly used presets in version control
7. **Document**: Add descriptions and version info for custom presets

## Next Steps

- [CLI Reference](/docs/cli/start) - Complete CLI command reference
- [Configuration](/docs/config/basic) - Detailed configuration guide
