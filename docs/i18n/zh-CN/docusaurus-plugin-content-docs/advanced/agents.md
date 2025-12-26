---
id: advanced/agents
title: Agent 系统
sidebar_position: 2
---

# Agent 系统

使用 Agent 系统扩展功能。

## 什么是 Agent？

Agent 是可插拔的功能模块，可以：
- 检测是否应处理请求
- 修改请求
- 提供自定义工具

## 内置 Agent

### Image Agent

通过检测请求中的图像 URL 或文件路径来处理图像相关任务。

当检测到图像相关内容时，Image Agent 会：
1. 标记请求需要图像处理
2. 添加图像分析工具到请求中
3. 拦截工具调用事件
4. 执行图像分析并返回结果

## Agent 配置

Agent 在服务器配置中配置并自动加载。

### 启用 Image Agent

Image Agent 内置于服务器中，无需额外配置。当请求包含图像内容时自动激活。

### 强制使用 Image Agent

如果您的模型不支持工具调用，可以在配置中设置 `config.forceUseImageAgent` 为 `true`：

```json
{
  "Router": {
    "image": "gemini,gemini-2.5-pro"
  },
  "forceUseImageAgent": true
}
```

## Agent 工具调用流程

1. **检测阶段**：在 `preHandler` 钩子中检测并标记 agents
2. **准备阶段**：将 agent 工具添加到请求中
3. **拦截阶段**：在 `onSend` 钩子中拦截工具调用事件
4. **执行阶段**：执行 agent 工具并发起新的 LLM 请求
5. **返回阶段**：将结果流式返回

## Agent 类型定义

```typescript
interface IAgent {
  name: string;
  shouldHandle: (req: any, config: any) => boolean;
  reqHandler: (req: any, config: any) => void;
  tools: Map<string, ITool>;
}

interface ITool {
  name: string;
  description: string;
  input_schema: object;
  handler: (args: any, context: any) => Promise<any>;
}
```

## 创建自定义 Agent

自定义 Agent 支持正在开发中！

## 使用示例

### 图像分析请求

当您发送包含图像的请求时：

```
请分析这张图片：/path/to/image.png
```

Image Agent 将：
1. 检测到图像路径
2. 添加图像分析工具
3. 调用配置的图像处理模型
4. 返回分析结果

### 路由到支持图像的模型

在配置中指定用于图像任务的模型：

```json
{
  "Router": {
    "image": "gemini,gemini-2.5-pro"
  }
}
```

## 下一步

- [预设](/zh/docs/advanced/presets) - 使用预定义配置
- [自定义路由器](/zh/docs/advanced/custom-router) - 编写自定义路由逻辑
