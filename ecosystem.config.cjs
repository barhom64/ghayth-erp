// ecosystem.config.cjs
// ---------------------------------------------------------------------------
// PM2 process manifest for traditional VPS deploys (no Docker). Keeps the
// api-server alive across crashes and reboots. Put this file at the repo
// root and run:
//
//   pnpm install
//   pnpm --filter @workspace/api-server build
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save && pm2 startup        # one-time, persists across reboots
//
// PM2 logs land in ~/.pm2/logs by default. Use `pm2 logs ghayth-api` to
// tail them or `pm2 monit` for the live dashboard.
//
// Why .cjs: PM2 still loads ecosystem files via require(), and the rest of
// the repo is ESM. Keeping this file CJS sidesteps that.
// ---------------------------------------------------------------------------

module.exports = {
  apps: [
    {
      name: "ghayth-api",
      script: "./artifacts/api-server/dist/index.mjs",
      // Spawn N workers, one per CPU core. PM2 round-robins requests via
      // its built-in load balancer, which ALSO requires the API to be safe
      // to run multi-process — it is, because session state lives in
      // Postgres + (optional) Redis, not in-memory.
      instances: "max",
      exec_mode: "cluster",

      // Restart policy: on crash, restart up to 10 times. After that pm2
      // gives up and marks the app as `errored` so we know to investigate
      // rather than burn CPU restarting a broken build.
      max_restarts: 10,
      min_uptime: "30s",
      restart_delay: 4000,

      // Avoid pid-leakage when the process forks workers (cron, etc.).
      kill_timeout: 5000,
      wait_ready: false,

      // Memory ceiling — pm2 restarts the worker if it crosses this. Tune
      // for the box. Default is generous (1 GB) so leaks don't take down
      // the whole instance.
      max_memory_restart: "1G",

      // Env shared by all environments.
      env: {
        NODE_ENV: "production",
        PORT: 8080,
        LOG_LEVEL: "info",
      },

      // Override per environment with `pm2 start ... --env staging`.
      env_staging: {
        NODE_ENV: "staging",
        LOG_LEVEL: "debug",
      },

      // Production-specific overrides go here. Real secrets (DATABASE_URL,
      // JWT_SECRET, ...) should be set via the OS environment, NOT this
      // file (which is checked in to git).
      env_production: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
      },

      // Source maps in stack traces — already enabled at runtime by the
      // npm `start` script via --enable-source-maps; PM2 just runs node
      // directly, so re-add the flag here.
      node_args: "--enable-source-maps",
    },
  ],
};
