# Claude Code Router

> This is a repository for testing routing Claude Code requests to different models.

## Usage

1. Install Claude Code

```shell
npm install -g @anthropic-ai/claude-code
```

2. Install Claude Code Router

```shell
npm install -g @arsasatria/ccw
```

3. Start Claude Code by ccw

```shell
ccr code
```


## Plugin

The plugin allows users to rewrite Claude Code prompt and custom router. The plugin path is in `$HOME/.ccw/plugins`. Currently, there are two demos available: 
1. [custom router](https://github.com/musistudio/ccw/blob/dev/custom-prompt/plugins/deepseek.js)
2. [rewrite prompt](https://github.com/musistudio/ccw/blob/dev/custom-prompt/plugins/gemini.js)

You need to move them to the `$HOME/.ccw/plugins` directory and configure 'usePlugin' in `$HOME/.ccw/config.json`，like this:

```json
{
    "usePlugin": "gemini",
    "LOG": true,
    "OPENAI_API_KEY": "",
    "OPENAI_BASE_URL": "",
    "OPENAI_MODEL": ""
}
```

## Features
- [x] Plugins
- [] Support change models
- [] Suport scheduled tasks