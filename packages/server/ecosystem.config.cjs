const os = require('os');
const path = require('path');

const logDir = path.join(os.homedir(), '.ccw', 'logs');

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
      error_file: path.join(logDir, 'error.log'),
      out_file: path.join(logDir, 'out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
};
