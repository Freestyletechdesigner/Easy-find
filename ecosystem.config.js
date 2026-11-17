// PM2 ecosystem file — manages the Node.js app on the VPS
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   ← run the command it prints to auto-start on reboot

module.exports = {
  apps: [
    {
      name: 'easyfind',
      script: 'app.js',
      cwd: '/var/www/easy-find',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 9000,
      },
      // Logs
      out_file: '/var/log/easyfind/node-out.log',
      error_file: '/var/log/easyfind/node-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
