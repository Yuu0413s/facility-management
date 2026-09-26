import { serve } from '@hono/node-server'
import { config } from 'dotenv'
import { app } from './app'

// wrangler を使わずにローカルで API を動かすための Node サーバー（Vite が /api をここへ転送する）
config({ quiet: true })

const port = 8787
serve({ fetch: (request) => app.fetch(request, process.env), port }, () => {
  console.log(`API: http://localhost:${port}/api/facility-pcs`)
})
