---
id: cli/other-commands
title: 其他命令
sidebar_position: 4
---

# 其他命令

管理 Claude Code Router 的其他 CLI 命令。

## ccr stop

停止运行中的服务器。

```bash
ccr stop
```

## ccr restart

重启服务器。

```bash
ccr restart
```

## ccr code

通过路由器执行 claude 命令。

```bash
ccr code [参数...]
```

## ccr activate

输出 shell 环境变量以供集成使用。

```bash
ccr activate
```

输出：

```bash
export ANTHROPIC_API_URL="http://localhost:3456/v1"
export ANTHROPIC_API_KEY="sk-xxxxx"
```

在 shell 中使用：

```bash
eval "$(ccr activate)"
```

`activate` 命令设置以下环境变量：

- `ANTHROPIC_AUTH_TOKEN`: 来自配置的 API 密钥
- `ANTHROPIC_BASE_URL`: 本地路由器端点（默认：`http://127.0.0.1:3456`）
- `NO_PROXY`: 设置为 `127.0.0.1` 以防止代理干扰
- `DISABLE_TELEMETRY`: 禁用遥测
- `DISABLE_COST_WARNINGS`: 禁用成本警告
- `API_TIMEOUT_MS`: 来自配置的 API 超时时间

## ccr ui

在浏览器中打开 Web UI。

```bash
ccr ui
```

## ccr statusline

集成状态栏（从 stdin 读取 JSON）。

```bash
echo '{"status":"running"}' | ccr statusline
```

## ccr config

配置管理命令。

### 编辑配置

```bash
ccr config edit
```

在默认编辑器中打开配置文件。

### 验证配置

```bash
ccr config validate
```

验证当前配置文件。

### 显示配置

```bash
ccr config show
```

显示当前配置（敏感值已隐藏）。

## ccr preset

预设管理命令。

### 列出预设

```bash
ccr preset list
```

### 应用预设

```bash
ccr preset apply <名称>
```

### 保存预设

```bash
ccr preset save <名称>
```

保存当前配置为预设。

## ccr log

查看服务器日志。

```bash
ccr log [选项]
```

选项：
- `-f, --follow`: 跟踪日志输出（类似 `tail -f`）
- `-n <行数>`: 显示的行数

## 全局选项

这些选项可用于任何命令：

| 选项 | 说明 |
|------|------|
| `-h, --help` | 显示帮助 |
| `-v, --version` | 显示版本号 |
| `--config <路径>` | 配置文件路径 |
| `--verbose` | 启用详细输出 |

## 示例

### 停止服务器

```bash
ccr stop
```

### 使用自定义配置重启

```bash
ccr restart --config /path/to/config.json
```

### 查看并设置环境变量

```bash
eval "$(ccr activate)"
```

### 打开 Web UI

```bash
ccr ui
```

### 跟踪日志

```bash
ccr log -f
```

### 列出可用预设

```bash
ccr preset list
```

### 应用预设

```bash
ccr preset apply development
```

## 相关文档

- [入门](/zh/docs/intro) - Claude Code Router 简介
- [配置](/zh/docs/config/basic) - 配置指南
