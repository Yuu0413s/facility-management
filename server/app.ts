import { neon } from '@neondatabase/serverless'
import { Hono } from 'hono'
import { createFacilityPcRepository, type FacilityPcRepository } from './db/facility-pcs-repository'
import { createFacilityPcRoutes, type Bindings } from './routes/facility-pcs'

type AppDeps = { createRepository: (databaseUrl: string) => FacilityPcRepository }

export const createApp = ({ createRepository }: AppDeps) =>
  new Hono<{ Bindings: Bindings }>()
    .basePath('/api')
    .route('/facility-pcs', createFacilityPcRoutes(createRepository))
    .onError((error, c) => {
      // 接続文字列などが画面に出ないよう、詳細はログにだけ残す
      console.error(error)
      return c.json({ message: 'サーバーでエラーが発生しました' }, 500)
    })

export const app = createApp({ createRepository: (databaseUrl) => createFacilityPcRepository(neon(databaseUrl)) })

export type AppType = typeof app
