import type { FacilityPcInput } from '../../shared/facility-pc-schema'
import {
  ApiError,
  createFacilityPc,
  deleteFacilityPc,
  fetchAllFacilityPcs,
  fetchFacilityPc,
  fetchFacilityPcPage,
  updateFacilityPc,
} from './facility-pcs-client'

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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('facility-pcs-client', () => {
  it('一覧は検索条件をクエリ文字列にして取得する', async () => {
    const page = { items: [], total: 0, page: 2, perPage: 50 }
    fetchMock.mockResolvedValue(jsonResponse(page))
    await expect(fetchFacilityPcPage({ q: '中央 病院', sort: 'pcName', order: 'desc', page: 2 })).resolves.toEqual(page)
    expect(fetchMock).toHaveBeenCalledWith('/api/facility-pcs?q=%E4%B8%AD%E5%A4%AE+%E7%97%85%E9%99%A2&sort=pcName&order=desc&page=2', undefined)
  })

  it('検索語が無ければ q を付けない', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, perPage: 50 }))
    await fetchFacilityPcPage({ sort: 'facilityName', order: 'asc', page: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/facility-pcs?sort=facilityName&order=asc&page=1', undefined)
  })

  it('全件・1件を取得する', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([])).mockResolvedValueOnce(jsonResponse({ ...input, id: 3 }))
    await fetchAllFacilityPcs()
    await fetchFacilityPc(3)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/facility-pcs/export', '/api/facility-pcs/3'])
  })

  it('登録・更新は JSON を送る', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ ...input, id: 1 }, 201))
    await createFacilityPc(input)
    await updateFacilityPc(1, input)
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/api/facility-pcs', 'POST', JSON.stringify(input)],
      ['/api/facility-pcs/1', 'PUT', JSON.stringify(input)],
    ])
  })

  it('削除は 204 を成功として扱う', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteFacilityPc(1)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/facility-pcs/1', { method: 'DELETE' })
  })

  it('失敗時はステータスとサーバーのメッセージ・項目エラーを持つ ApiError を投げる', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: '入力内容に誤りがあります', fieldErrors: { pcName: ['入力してください'] } }, 400))
    const error = await createFacilityPc(input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, message: '入力内容に誤りがあります', fieldErrors: { pcName: ['入力してください'] } })
  })

  it('本文が JSON でない失敗でもメッセージを用意する', async () => {
    fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
    await expect(fetchFacilityPc(1)).rejects.toMatchObject({ status: 502, message: '通信に失敗しました（502）' })
  })
})
