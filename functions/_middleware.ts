import { handleMiddleware } from 'hono/cloudflare-pages'
import { createBasicAuth } from '../server/basic-auth'

// functions 直下の _middleware は静的ファイル（画面）を含む全リクエストの前に動く
export const onRequest = handleMiddleware(createBasicAuth())
