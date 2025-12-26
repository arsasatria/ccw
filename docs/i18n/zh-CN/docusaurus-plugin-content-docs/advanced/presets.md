---
id: advanced/presets
title: 预设配置
sidebar_position: 3
---

# 预设配置

使用预定义配置进行快速设置。

## 什么是预设？

预设是预配置的设置，包括针对特定用例优化的提供商配置、路由规则和转换器。

## 可用预设

### Development（开发）

针对软件开发任务优化：
- 快速响应时间
- 适合代码生成
- 成本效益高

配置特点：
- 使用轻量级模型处理后台任务
- 为代码任务选择专用模型
- 优化的超时设置

### Research（研究）

针对研究和分析优化：
- 支持长上下文
- 高质量响应
- 更强大的模型

配置特点：
- 使用具有大上下文窗口的模型
- 为分析任务选择高级模型
- 较长的超时时间

### Balanced（平衡）

在速度和质量之间取得平衡：
- 良好的通用性能
- 合理的成本
- 广泛的模型支持

配置特点：
- 混合使用快速和高质量的模型
- 适合大多数日常任务
- 平衡的成本效益

## 使用预设

使用 CLI 应用预设：

```bash
ccr preset apply development
```

列出可用预设：

```bash
ccr preset list
```

## 创建自定义预设

您可以通过保存配置并稍后重新加载来创建自定义预设：

```bash
# 将当前配置保存为预设
ccr preset save my-preset

# 加载已保存的预设
ccr preset apply my-preset
```

## 预设管理

### 列出所有预设

```bash
ccr preset list
```

输出示例：

```
可用预设:
  development    - 开发优化配置
  research       - 研究优化配置
  balanced       - 平衡配置
  my-preset      - 自定义预设
```

### 应用预设

```bash
ccr preset apply <预设名称>
```

应用预设后，服务器将自动重启以加载新配置。

### 删除预设

```bash
ccr preset delete <预设名称>
```

## 预设文件位置

预设保存在：

```
~/.ccw/presets/
```

每个预设都是一个 JSON 文件，包含完整的配置。

## 预设文件示例

```json
{
  "name": "development",
  "description": "针对软件开发优化的配置",
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "$DEEPSEEK_API_KEY",
      "models": ["deepseek-chat", "deepseek-coder"]
    },
    {
      "name": "groq",
      "api_base_url": "https://api.groq.com/openai/v1/chat/completions",
      "api_key": "$GROQ_API_KEY",
      "models": ["llama-3.3-70b-versatile"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "background": "groq,llama-3.3-70b-versatile",
    "think": "deepseek,deepseek-chat"
  }
}
```

## 导出和导入预设

### 导出当前配置

```bash
ccr config show > my-config.json
```

### 导入配置

```bash
ccr config edit
# 然后粘贴导入的配置
```

## 最佳实践

1. **为不同项目创建预设**：为不同的工作流程创建专门的预设
2. **版本控制**：将常用预设保存在版本控制中
3. **文档化**：为自定义预设添加描述
4. **测试**：在应用预设后验证配置

## 下一步

- [CLI 参考](/zh/docs/cli/start) - 完整的 CLI 命令参考
- [配置](/zh/docs/config/basic) - 详细配置指南
