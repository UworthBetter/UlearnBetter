/**
 * Process entry point: start the HTTP server.
 *
 * Reads configuration from process.env. If no model provider is configured the
 * server still starts so /health is reachable, but /api/copilotkit returns an
 * explicit 503 — it never answers with a mock.
 */

import { createApp } from './app.mjs'
import { loadConfig } from './config.mjs'

async function main() {
  const { app, ready, reason, config } = await createApp(process.env)

  // Resolve the port independently so an unconfigured server still binds.
  let port = 4000
  try {
    port = loadConfig(process.env).port
  } catch {
    port = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 4000
  }

  const server = app.listen(port, '127.0.0.1', () => {
    if (ready) {
      // eslint-disable-next-line no-console
      console.log(
        `[assistant-backend] ready on http://localhost:${port} ` +
          `(provider=${config.provider} model=${config.model} notes=${config.notesRetrieval})\n` +
          `  settings page: http://localhost:${port}/settings`,
      )
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `[assistant-backend] started on http://localhost:${port} but NOT ready: ${reason}\n` +
          `  /health is up; /api/copilotkit will return 503 until configured.\n` +
          `  configure via the settings page: http://localhost:${port}/settings (saves to server/.data/settings.json) or server/.env`,
      )
    }
  })

  const shutdown = (signal) => {
    // eslint-disable-next-line no-console
    console.log(`[assistant-backend] ${signal} received, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[assistant-backend] fatal startup error:', err)
  process.exit(1)
})
