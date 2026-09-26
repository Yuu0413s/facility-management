import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { facilityPcInputSchema, importRequestSchema, listQuerySchema } from '../../shared/facility-pc-schema'
import { DuplicateError, type FacilityPcRepository } from '../db/facility-pcs-repository'
import { importFacilityPcs } from '../import-facility-pcs'

export type Bindings = {
  DATABASE_URL: string
  BASIC_AUTH_USER: string
  BASIC_AUTH_PASSWORD: string
}

type AppEnv = { Bindings: Bindings; Variables: { repository: FacilityPcRepository } }

const NOT_FOUND = { message: '該当するデータが見つかりません' }

// 画面側で項目ごとにエラーを出せるよう、400 は項目名ごとのメッセージにして返す
const validate = <Target extends 'json' | 'query', Schema extends z.ZodType>(target: Target, schema: Schema) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const { formErrors, fieldErrors } = z.flattenError(result.error)
      // 「いずれかの項目を入力してください」のように、特定の項目に属さないエラーはメッセージとして返す
      return c.json({ message: formErrors[0] ?? '入力内容に誤りがあります', fieldErrors }, 400)
    }
  })

// 取り込みのリクエストは行数の上限などリクエスト全体の誤りなので、最初の理由をそのままメッセージにする
// （各行の中身の誤りは 400 にせず、行ごとのエラーとして結果に含める）
const validateImportRequest = zValidator('json', importRequestSchema, (result, c) => {
  if (!result.success) return c.json({ message: result.error.issues[0]?.message ?? '取り込みのデータが正しくありません' }, 400)
})

// id 列は INTEGER。数字以外・0 以下・INTEGER の範囲外は DB に問い合わせるまでもなく存在しない
const MAX_ID = 2_147_483_647
const parseId = (raw: string) => {
  if (!/^[1-9]\d*$/.test(raw)) return null
  const id = Number(raw)
  return id <= MAX_ID ? id : null
}

const withDuplicateAs409 = async (c: { json: (body: unknown, status: 409) => Response }, action: () => Promise<Response>) => {
  try {
    return await action()
  } catch (error) {
    if (error instanceof DuplicateError) return c.json({ message: error.message }, 409)
    throw error
  }
}

export const createFacilityPcRoutes = (createRepository: (databaseUrl: string) => FacilityPcRepository) =>
  new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('repository', createRepository(c.env.DATABASE_URL))
      await next()
    })
    .get('/', validate('query', listQuerySchema), async (c) => {
      return c.json(await c.var.repository.list(c.req.valid('query')))
    })
    .get('/export', async (c) => {
      return c.json(await c.var.repository.listAll())
    })
    .get('/:id', async (c) => {
      const id = parseId(c.req.param('id'))
      const found = id === null ? null : await c.var.repository.findById(id)
      return found ? c.json(found) : c.json(NOT_FOUND, 404)
    })
    .post('/', validate('json', facilityPcInputSchema), (c) =>
      withDuplicateAs409(c, async () => c.json(await c.var.repository.create(c.req.valid('json')), 201)),
    )
    // Excel の取り込み。正しい行だけを取り込み、エラーの行は行番号と理由を返す
    .post('/import', validateImportRequest, (c) =>
      withDuplicateAs409(c, async () => c.json(await importFacilityPcs(c.var.repository, c.req.valid('json').rows))),
    )
    .put('/:id', validate('json', facilityPcInputSchema), (c) =>
      withDuplicateAs409(c, async () => {
        const id = parseId(c.req.param('id'))
        const updated = id === null ? null : await c.var.repository.update(id, c.req.valid('json'))
        return updated ? c.json(updated) : c.json(NOT_FOUND, 404)
      }),
    )
    .delete('/:id', async (c) => {
      const id = parseId(c.req.param('id'))
      const deleted = id !== null && (await c.var.repository.delete(id))
      return deleted ? c.body(null, 204) : c.json(NOT_FOUND, 404)
    })
