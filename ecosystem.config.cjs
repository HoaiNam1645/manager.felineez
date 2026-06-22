// PM2 process manager configuration for NH-Media dashboard.
//
//   pm2 start ecosystem.config.cjs
//   pm2 logs nh-media
//   pm2 restart nh-media

module.exports = {
  apps: [
    {
      name: 'nh-media',
      script: 'npm',
      args: 'run start',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3030,
      },
    },
  ],
};
