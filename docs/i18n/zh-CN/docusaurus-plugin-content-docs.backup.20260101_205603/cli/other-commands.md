---
id: cli/other-commands
title: 其他命令
sidebar_position: 4
---

# 其他命令

管理 Claude Code Wrapper 的其他 CLI 命令。

## ccw stop

停止运行中的服务器。

```bash
ccw stop
```

## ccw restart

重启服务器。

```bash
ccw restart
```

## ccw code

通过路由器执行 claude 命令。

```bash
ccw code [参数...]
```

## ccw ui

在浏览器中打开 Web UI。

```bash
ccw ui
```

## ccw activate

输出用于与外部工具集成的 shell 环境变量。

```bash
ccw activate
```

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
ccw stop
```

### 使用自定义配置重启

```bash
ccw restart --config /path/to/config.json
```

### 打开 Web UI

```bash
ccw ui
```

## 相关文档

- [入门](/zh/docs/intro) - Claude Code Wrapper 简介
- [配置](/zh/docs/config/basic) - 配置指南
