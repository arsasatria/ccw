module.exports = {
  apps: [
    {
      name: 'ccw-server',
      script: '/app/packages/server/dist/index.js',
      cwd: '/app/packages/server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      // 日志配置
      error_file: '/root/.ccw/logs/error.log',
      out_file: '/root/.ccw/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 启用日志时间戳
      time: true,
    },
  ],
};
