import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    {
      type: 'category',
      label: 'Server',
      link: {
        type: 'generated-index',
        title: 'Claude Code Router Server',
        description: '部署和管理 Claude Code Router 服务',
        slug: 'category/server',
      },
      items: [
        'server/intro',
        'server/deployment',
        {
          type: 'category',
          label: 'API Reference',
          link: {
            type: 'generated-index',
            title: 'API Reference',
            description: '服务器 API 接口文档',
            slug: 'category/api',
          },
          items: [
            'server/api/overview',
            'server/api/messages-api',
            'server/api/config-api',
            'server/api/logs-api',
          ],
        },
        {
          type: 'category',
          label: 'Configuration',
          link: {
            type: 'generated-index',
            title: 'Server Configuration',
            description: '服务器配置说明',
            slug: 'category/server-config',
          },
          items: [
            'server/config/basic',
            'server/config/providers',
            'server/config/routing',
            'server/config/transformers',
          ],
        },
        {
          type: 'category',
          label: 'Advanced',
          link: {
            type: 'generated-index',
            title: 'Advanced Topics',
            description: '高级功能和自定义',
            slug: 'category/server-advanced',
          },
          items: [
            'server/advanced/custom-router',
            'server/advanced/agents',
            'server/advanced/presets',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'CLI',
      link: {
        type: 'generated-index',
        title: 'Claude Code Router CLI',
        description: '命令行工具使用指南',
        slug: 'category/cli',
      },
      items: [
        'cli/intro',
        'cli/installation',
        'cli/quick-start',
        {
          type: 'category',
          label: 'Commands',
          link: {
            type: 'generated-index',
            title: 'CLI Commands',
            description: '完整的命令参考',
            slug: 'category/cli-commands',
          },
          items: [
            'cli/commands/start',
            'cli/commands/model',
            'cli/commands/status',
            'cli/commands/other',
          ],
        },
        {
          type: 'category',
          label: 'Configuration',
          link: {
            type: 'generated-index',
            title: 'CLI Configuration',
            description: 'CLI 配置说明',
            slug: 'category/cli-config',
          },
          items: [
            'cli/config/basic',
            'cli/config/project-level',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
