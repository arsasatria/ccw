---
id: advanced/presets
title: 预设配置
sidebar_position: 3
---

# 预设配置

使用预定义配置进行快速设置。

## 什么是预设？

预设是预配置的设置，包括针对特定用例优化的提供商配置、路由规则和转换器。

## 动态配置系统 (v2.0+)

CCR 2.0 引入了强大的动态配置系统，支持：

- **多种输入类型**：选择器、多选、确认框、文本输入、数字输入等
- **条件逻辑**：根据用户输入动态显示/隐藏配置项
- **变量引用**：配置项之间可以互相引用
- **动态选项**：选项列表可以从预设配置或用户输入中动态生成

### Schema 字段类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `password` | 密码输入（隐藏显示） | API Key |
| `input` | 单行文本输入 | Base URL |
| `number` | 数字输入 | 最大Token数 |
| `select` | 单选下拉框 | 选择Provider |
| `multiselect` | 多选框 | 启用功能 |
| `confirm` | 确认框 | 是否使用代理 |
| `editor` | 多行文本编辑器 | 自定义配置 |

### 条件运算符

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `eq` | 等于 | `{"field": "provider", "operator": "eq", "value": "openai"}` |
| `ne` | 不等于 | `{"field": "advanced", "operator": "ne", "value": true}` |
| `in` | 包含于 | `{"field": "feature", "operator": "in", "value": ["a", "b"]}` |
| `nin` | 不包含于 | `{"field": "type", "operator": "nin", "value": ["x", "y"]}` |
| `exists` | 字段存在 | `{"field": "apiKey", "operator": "exists"}` |
| `gt/lt/gte/lte` | 大于/小于/大于等于/小于等于 | 用于数字比较 |

### 动态选项类型

#### static - 静态选项
```json
"options": {
  "type": "static",
  "options": [
    {"label": "选项1", "value": "value1"},
    {"label": "选项2", "value": "value2"}
  ]
}
```

#### providers - 从 Providers 配置提取
```json
"options": {
  "type": "providers"
}
```
自动从 `Providers` 数组中提取 name 作为选项。

#### models - 从指定 Provider 的 models 提取
```json
"options": {
  "type": "models",
  "providerField": "{{selectedProvider}}"
}
```
根据用户选择的 Provider，动态显示该 Provider 的 models。

### 模板变量

使用 `{{变量名}}` 语法在 template 中引用用户输入：

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

### 配置映射

对于复杂的配置需求，使用 `configMappings` 精确控制值的位置：

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

### 完整示例

```json
{
  "name": "multi-provider-example",
  "version": "1.0.0",
  "description": "多Provider配置示例 - 支持OpenAI和DeepSeek切换",
  "author": "CCR Team",
  "keywords": ["openai", "deepseek", "multi-provider"],
  "ccwVersion": "2.0.0",
  "schema": [
    {
      "id": "primaryProvider",
      "type": "select",
      "label": "主要Provider",
      "prompt": "选择您主要使用的LLM提供商",
      "options": {
        "type": "static",
        "options": [
          {
            "label": "OpenAI",
            "value": "openai",
            "description": "使用OpenAI的GPT模型"
          },
          {
            "label": "DeepSeek",
            "value": "deepseek",
            "description": "使用DeepSeek的高性价比模型"
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
      "prompt": "请输入您的API Key",
      "placeholder": "sk-...",
      "required": true
    },
    {
      "id": "defaultModel",
      "type": "select",
      "label": "默认模型",
      "prompt": "选择默认使用的模型",
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
      "label": "启用代理",
      "prompt": "是否通过代理访问API？",
      "defaultValue": false
    },
    {
      "id": "proxyUrl",
      "type": "input",
      "label": "代理地址",
      "prompt": "输入代理服务器地址",
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

创建包含 `schema` 和 `template` 的预设文件：

```bash
# 创建预设目录
mkdir -p ~/.ccw/presets/my-preset

# 创建 manifest.json
cat > ~/.ccw/presets/my-preset/manifest.json << 'EOF'
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "我的自定义预设",
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

# 应用预设（会提示输入API Key）
ccr my-preset
```

您也可以通过保存配置并稍后重新加载来创建自定义预设：

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

每个预设都是一个目录，包含 `manifest.json` 文件。

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

1. **使用动态配置**：为需要用户输入的配置项使用schema系统
2. **提供默认值**：为非必填项提供合理的默认值
3. **条件显示**：使用when条件避免不必要的输入
4. **清晰的标签**：为每个字段提供清晰的label和prompt
5. **验证输入**：使用validator确保输入的有效性
6. **版本控制**：将常用预设保存在版本控制中
7. **文档化**：为自定义预设添加描述和版本信息

## 下一步

- [CLI 参考](/zh/docs/cli/start) - 完整的 CLI 命令参考
- [配置](/zh/docs/config/basic) - 详细配置指南
