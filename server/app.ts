import { neon } from '@neondatabase/serverless'
import { Hono } from 'hono'
import { createFacilityPcRepository, type FacilityPcRepository } from './db/facility-pcs-repository'
import { createFacilityPcRoutes, type Bindings } from './routes/facility-pcs'

type AppDeps = { createRepository: (databaseUrl: string) => FacilityPcRepository }

export const createApp = ({ createRepository }: AppDeps) =>
  new Hono<{ Bindings: Bindings }>()
    .basePath('/api')
    .use(async (c, next) => {
      await next()
      // 応答にパスワードや Key が含まれるため、ブラウザや途中の経路に保存させない
      c.header('Cache-Control', 'no-store')
    })
    .route('/facility-pcs', createFacilityPcRoutes(createRepository))
    .onError((error, c) => {
      // Neon のエラーメッセージには接続文字列（DB のパスワード）が含まれることがあるため、
      // レスポンスにもログにもメッセージは出さず、種類と PostgreSQL のエラーコードだけを残す
      console.error('Unhandled error', { name: error.name, code: 'code' in error ? error.code : undefined })
      return c.json({ message: 'サーバーでエラーが発生しました' }, 500)
    })

export const app = createApp({ createRepository: (databaseUrl) => createFacilityPcRepository(neon(databaseUrl)) })

export type AppType = typeof app
