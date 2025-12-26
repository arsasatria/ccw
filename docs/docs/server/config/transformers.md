---
sidebar_position: 4
---

# Transformers

Transformers adapt API differences between providers.

## Built-in Transformers

### anthropic

Transforms requests to be compatible with Anthropic-style APIs:

```json
{
  "transformers": [
    {
      "name": "anthropic",
      "providers": ["deepseek", "groq"]
    }
  ]
}
```

### deepseek

Specialized transformer for DeepSeek API:

```json
{
  "transformers": [
    {
      "name": "deepseek",
      "providers": ["deepseek"]
    }
  ]
}
```

### gemini

Transformer for Google Gemini API:

```json
{
  "transformers": [
    {
      "name": "gemini",
      "providers": ["gemini"]
    }
  ]
}
```

### groq

Transformer for Groq API:

```json
{
  "transformers": [
    {
      "name": "groq",
      "providers": ["groq"]
    }
  ]
}
```

### openrouter

Transformer for OpenRouter API:

```json
{
  "transformers": [
    {
      "name": "openrouter",
      "providers": ["openrouter"]
    }
  ]
}
```

## Applying Transformers

### Global Application

Apply to all requests for a provider:

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-api-key",
      "transformers": ["anthropic"]
    }
  ]
}
```

### Model-Specific Application

Apply to specific models:

```json
{
  "transformers": [
    {
      "name": "maxtoken",
      "options": {
        "max_tokens": 8192
      },
      "models": ["deepseek,deepseek-chat"]
    }
  ]
}
```

### Passing Options

Some transformers accept options:

```json
{
  "transformers": [
    {
      "name": "maxtoken",
      "options": {
        "max_tokens": 8192
      }
    }
  ]
}
```

## Custom Transformers

Create custom transformer plugins:

1. Create a transformer file:

```javascript
module.exports = {
  name: 'my-transformer',
  transformRequest: async (req, config) => {
    // Modify request
    return req;
  },
  transformResponse: async (res, config) => {
    // Modify response
    return res;
  }
};
```

2. Load in configuration:

```json
{
  "transformers": [
    {
      "name": "my-transformer",
      "path": "/path/to/transformer.js"
    }
  ]
}
```

## Next Steps

- [Advanced Topics](/docs/advanced/custom-router) - Advanced routing customization
- [Agents](/docs/advanced/agents) - Extending with agents
