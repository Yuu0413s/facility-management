import type { FacilityPc, FacilityPcInput } from '../shared/facility-pc-schema'
import { createApp } from './app'
import { DuplicateFacilityPcError, type FacilityPcRepository } from './db/facility-pcs-repository'

const input: FacilityPcInput = {
  facilityName: '中央病院',
  pcName: 'PC-001',
  installedOn: '2026-09-26',
  osVersion: 'Windows 11',
  officeType: 'Pro',
  officeVersion: '2021',
  licenseKey: 'KEY-1',
  account: 'user1',
  password: 'secret',
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

    const res = await request(`/api/facility-pcs?q=${encodeURIComponent(' 中央 ')}&order=desc&page=2`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(page)
    expect(repository.list).toHaveBeenCalledWith({ q: '中央', order: 'desc', page: 2 })
    expect(createRepository).toHaveBeenCalledWith('postgres://example')
  })

  it('省略時は order=asc, page=1', async () => {
    const { repository, request } = setup()
    repository.list.mockResolvedValue({ items: [], total: 0, page: 1, perPage: 50 })
    await request('/api/facility-pcs')
    expect(repository.list).toHaveBeenCalledWith({ q: undefined, order: 'asc', page: 1 })
  })

  it('不正なページ番号は 400', async () => {
    const { repository, request } = setup()
    const res = await request('/api/facility-pcs?page=0')
    expect(res.status).toBe(400)
    expect(repository.list).not.toHaveBeenCalled()
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

  it.each(['abc', '0', '1.5'])('id=%s は DB に問い合わせず 404', async (id) => {
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

  it('入力エラーは 400 で項目ごとのメッセージを返す', async () => {
    const { repository, send } = setup()
    const res = await send('POST', '/api/facility-pcs', { ...input, pcName: '' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { fieldErrors: Record<string, string[]> }
    expect(body.fieldErrors.pcName).toEqual(['入力してください'])
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('重複は 409', async () => {
    const { repository, send } = setup()
    repository.create.mockRejectedValue(new DuplicateFacilityPcError())
    const res = await send('POST', '/api/facility-pcs', input)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { message: string }).message).toBe('同じ施設に同じPC名がすでに登録されています')
  })

  it('想定外のエラーは 500 で詳細を返さない', async () => {
    const { repository, send } = setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    repository.create.mockRejectedValue(new Error('connection string postgres://secret'))
    const res = await send('POST', '/api/facility-pcs', input)
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('secret')
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
