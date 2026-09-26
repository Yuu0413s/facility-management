import { inspect } from 'node:util'
import type { FacilityPc, FacilityPcInput } from '../shared/facility-pc-schema'
import { createApp } from './app'
import { DuplicateFacilityPcError, DuplicateTagError, type FacilityPcRepository } from './db/facility-pcs-repository'

const input: FacilityPcInput = {
  facilityName: '中央病院',
  pcName: 'PC-001',
  tag: null,
  installedOn: '2026-09-26',
  osVersion: 'Windows 11',
  officeType: 'Pro',
  officeVersion: '2021',
  licenseKey: 'ABCDE12345FGHIJ67890KLMNO',
  account: 'user1',
  password: 'secret',
  registeredOn: '2026-04-01',
  remarks: null,
}
const saved: FacilityPc = { ...input, id: 1 }

const env = { DATABASE_URL: 'postgres://example', BASIC_AUTH_USER: 'u', BASIC_AUTH_PASSWORD: 'p' }

const setup = () => {
  const repository = {
    list: vi.fn(),
    listAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findTagIssues: vi.fn(),
    upsertMany: vi.fn(),
  } satisfies Record<keyof FacilityPcRepository, unknown>
  const createRepository = vi.fn(() => repository as FacilityPcRepository)
  const app = createApp({ createRepository })
  const request = (path: string, init?: RequestInit) => app.request(path, init, env)
  const send = (method: string, path: string, body: unknown) =>
    request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { repository, createRepository, request, send }
}

describe('GET /api/facility-pcs', () => {
  it('検索条件を整えてリポジトリに渡し、ページを返す', async () => {
    const { repository, createRepository, request } = setup()
    const page = { items: [saved], total: 1, page: 2, perPage: 50 }
    repository.list.mockResolvedValue(page)

    const res = await request(`/api/facility-pcs?q=${encodeURIComponent(' 中央 ')}&sort=pcName&order=desc&page=2`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(page)
    expect(repository.list).toHaveBeenCalledWith({ q: '中央', sort: 'pcName', order: 'desc', page: 2 })
    expect(createRepository).toHaveBeenCalledWith('postgres://example')
  })

  it('省略時は sort=facilityName, order=asc, page=1', async () => {
    const { repository, request } = setup()
    repository.list.mockResolvedValue({ items: [], total: 0, page: 1, perPage: 50 })
    await request('/api/facility-pcs')
    expect(repository.list).toHaveBeenCalledWith({ q: undefined, sort: 'facilityName', order: 'asc', page: 1 })
  })

  it.each(['tag', 'installedOn', 'registeredOn'])('sort=%s で並べ替えを依頼できる', async (sort) => {
    const { repository, request } = setup()
    repository.list.mockResolvedValue({ items: [], total: 0, page: 1, perPage: 50 })
    await request(`/api/facility-pcs?sort=${sort}`)
    expect(repository.list).toHaveBeenCalledWith({ q: undefined, sort, order: 'asc', page: 1 })
  })

  it('決められた列以外での並べ替えは 400', async () => {
    const { repository, request } = setup()
    const res = await request('/api/facility-pcs?sort=password')
    expect(res.status).toBe(400)
    expect(repository.list).not.toHaveBeenCalled()
  })

  it('不正なページ番号は 400', async () => {
    const { repository, request } = setup()
    const res = await request('/api/facility-pcs?page=0')
    expect(res.status).toBe(400)
    expect(repository.list).not.toHaveBeenCalled()
  })
})

describe('キャッシュ', () => {
  it('パスワードを含むため、API の応答はブラウザに保存させない', async () => {
    const { repository, request } = setup()
    repository.listAll.mockResolvedValue([saved])
    const res = await request('/api/facility-pcs/export')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /api/facility-pcs/import', () => {
  it('行データを受け取って取り込み、件数とエラー行を返す', async () => {
    const { repository, send } = setup()
    repository.findTagIssues.mockResolvedValue([])
    repository.upsertMany.mockResolvedValue({ created: 1, updated: 0 })
    const res = await send('POST', '/api/facility-pcs/import', {
      rows: [
        { rowNumber: 2, values: { facilityName: 'A病院' } },
        { rowNumber: 3, values: { officeType: 'Home' } },
      ],
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      created: 1,
      updated: 0,
      errors: [{ rowNumber: 3, issues: [{ field: 'officeType', message: '選択肢から選んでください' }] }],
    })
  })

  it('1,000行を超えるリクエストは 400', async () => {
    const { send } = setup()
    const rows = Array.from({ length: 1001 }, (_, index) => ({ rowNumber: index + 2, values: { facilityName: 'A' } }))
    const res = await send('POST', '/api/facility-pcs/import', { rows })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toBe('一度に取り込めるのは1000行までです')
  })

  it('行番号が重複しているリクエストは 400（行番号でエラー行を伝えるため）', async () => {
    const { send } = setup()
    const res = await send('POST', '/api/facility-pcs/import', {
      rows: [
        { rowNumber: 2, values: { facilityName: 'A' } },
        { rowNumber: 2, values: { facilityName: 'B' } },
      ],
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toBe('行番号が重複しています')
  })

  it('行が無い・形が違うリクエストは 400', async () => {
    const { send } = setup()
    expect((await send('POST', '/api/facility-pcs/import', { rows: [] })).status).toBe(400)
    expect((await send('POST', '/api/facility-pcs/import', { foo: 1 })).status).toBe(400)
  })
})

describe('GET /api/facility-pcs/export', () => {
  it('全件を返す', async () => {
    const { repository, request } = setup()
    repository.listAll.mockResolvedValue([saved])
    const res = await request('/api/facility-pcs/export')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([saved])
  })
})

describe('GET /api/facility-pcs/:id', () => {
  it('見つかれば 200', async () => {
    const { repository, request } = setup()
    repository.findById.mockResolvedValue(saved)
    const res = await request('/api/facility-pcs/1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(saved)
    expect(repository.findById).toHaveBeenCalledWith(1)
  })

  it('見つからなければ 404', async () => {
    const { repository, request } = setup()
    repository.findById.mockResolvedValue(null)
    expect((await request('/api/facility-pcs/99')).status).toBe(404)
  })

  it.each(['abc', '0', '1.5', '2147483648', '9'.repeat(400)])('id=%s は DB に問い合わせず 404', async (id) => {
    const { repository, request } = setup()
    expect((await request(`/api/facility-pcs/${id}`)).status).toBe(404)
    expect(repository.findById).not.toHaveBeenCalled()
  })
})

describe('POST /api/facility-pcs', () => {
  it('整えた入力で登録し 201', async () => {
    const { repository, send } = setup()
    repository.create.mockResolvedValue(saved)
    const res = await send('POST', '/api/facility-pcs', { ...input, facilityName: ' 中央病院 ', remarks: '' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(saved)
    expect(repository.create).toHaveBeenCalledWith(input)
  })

  it('Key はハイフンを除いて大文字にしてから保存する', async () => {
    const { repository, send } = setup()
    repository.create.mockResolvedValue(saved)
    await send('POST', '/api/facility-pcs', { ...input, licenseKey: 'abcde-12345-fghij-67890-klmno' })
    expect(repository.create).toHaveBeenCalledWith(input)
  })

  it('アカウント登録日は入力項目として受け付け、存在しない日付なら 400', async () => {
    const { repository, send } = setup()
    repository.create.mockResolvedValue(saved)
    await send('POST', '/api/facility-pcs', { ...input, registeredOn: '2020-01-15' })
    expect(repository.create).toHaveBeenCalledWith({ ...input, registeredOn: '2020-01-15' })

    const res = await send('POST', '/api/facility-pcs', { ...input, registeredOn: '2020-02-30' })
    expect(res.status).toBe(400)
  })

  it('入力エラーは 400 で項目ごとのメッセージを返す', async () => {
    const { repository, send } = setup()
    const res = await send('POST', '/api/facility-pcs', { ...input, installedOn: '2026-02-30' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { fieldErrors: Record<string, string[]> }
    expect(body.fieldErrors.installedOn).toEqual(['存在しない日付です'])
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('全項目が空欄なら 400 で、項目に属さないエラーをメッセージとして返す', async () => {
    const { repository, send } = setup()
    const res = await send('POST', '/api/facility-pcs', { facilityName: '  ' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toBe('いずれかの項目を入力してください')
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('重複は 409', async () => {
    const { repository, send } = setup()
    repository.create.mockRejectedValue(new DuplicateFacilityPcError())
    const res = await send('POST', '/api/facility-pcs', input)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { message: string }).message).toBe('同じ施設に同じPC名がすでに登録されています')
  })

  it('Tag の重複は 409 で、Tag の重複だとわかるメッセージを返す', async () => {
    const { repository, send } = setup()
    repository.create.mockRejectedValue(new DuplicateTagError())
    const res = await send('POST', '/api/facility-pcs', input)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { message: string }).message).toBe('同じTagがすでに登録されています')
  })

  it('想定外のエラーは 500 で、レスポンスにもログにも詳細（接続文字列など）を出さない', async () => {
    const { repository, send } = setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    repository.create.mockRejectedValue(Object.assign(new Error('connection string postgres://user:TOPSECRET@host'), { code: '08006' }))
    const res = await send('POST', '/api/facility-pcs', input)

    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('TOPSECRET')
    expect(consoleError).toHaveBeenCalled()
    // console.error が実際に出力する形（util.inspect）で確認する
    expect(inspect(consoleError.mock.calls)).not.toContain('TOPSECRET')
    expect(inspect(consoleError.mock.calls)).toContain('08006')
    consoleError.mockRestore()
  })

  it('壊れた JSON は 500 ではなく 400 にする', async () => {
    const { repository, request } = setup()
    const res = await request('/api/facility-pcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    expect(res.status).toBe(400)
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('JSON 以外で送られた登録は 400 にする（別サイトのフォームからの送信を防ぐ）', async () => {
    const { repository, request } = setup()
    const res = await request('/api/facility-pcs', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(input),
    })
    expect(res.status).toBe(400)
    expect(repository.create).not.toHaveBeenCalled()
  })
})

describe('PUT /api/facility-pcs/:id', () => {
  it('更新して 200', async () => {
    const { repository, send } = setup()
    repository.update.mockResolvedValue(saved)
    const res = await send('PUT', '/api/facility-pcs/1', input)
    expect(res.status).toBe(200)
    expect(repository.update).toHaveBeenCalledWith(1, input)
  })

  it('入力エラーは 400', async () => {
    const { send } = setup()
    expect((await send('PUT', '/api/facility-pcs/1', { ...input, officeType: 'Home' })).status).toBe(400)
  })

  it('全項目を空欄にする更新も 400（中身が空の行を作らないため、登録と同じく禁止する）', async () => {
    const { repository, send } = setup()
    const res = await send('PUT', '/api/facility-pcs/1', {})
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toBe('いずれかの項目を入力してください')
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('存在しなければ 404', async () => {
    const { repository, send } = setup()
    repository.update.mockResolvedValue(null)
    expect((await send('PUT', '/api/facility-pcs/1', input)).status).toBe(404)
  })

  it('重複は 409', async () => {
    const { repository, send } = setup()
    repository.update.mockRejectedValue(new DuplicateFacilityPcError())
    expect((await send('PUT', '/api/facility-pcs/1', input)).status).toBe(409)
  })
})

describe('DELETE /api/facility-pcs/:id', () => {
  it('削除できたら 204', async () => {
    const { repository, request } = setup()
    repository.delete.mockResolvedValue(true)
    const res = await request('/api/facility-pcs/1', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(repository.delete).toHaveBeenCalledWith(1)
  })

  it('存在しなければ 404', async () => {
    const { repository, request } = setup()
    repository.delete.mockResolvedValue(false)
    expect((await request('/api/facility-pcs/1', { method: 'DELETE' })).status).toBe(404)
  })
})
