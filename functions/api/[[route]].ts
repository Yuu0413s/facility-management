import { handle } from 'hono/cloudflare-pages'
import { app } from '../../server/app'

// /api/* をすべて Hono に渡す。Cloudflare 固有の処理はここと _middleware.ts だけに閉じ込める
export const onRequest = handle(app)
