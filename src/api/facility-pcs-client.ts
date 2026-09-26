import type { FacilityPc, FacilityPcInput, FacilityPcPage, ListQuery } from '../../shared/facility-pc-schema'

const BASE_URL = '/api/facility-pcs'

export type FieldErrors = Partial<Record<keyof FacilityPcInput, string[]>>

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, init)
  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T
  }
  const body = (await res.json().catch(() => null)) as { message?: string; fieldErrors?: FieldErrors } | null
  throw new ApiError(res.status, body?.message ?? `通信に失敗しました（${res.status}）`, body?.fieldErrors)
}

const sendJson = (method: 'POST' | 'PUT', body: FacilityPcInput): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const fetchFacilityPcPage = ({ q, sort, order, page }: ListQuery) => {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('order', order)
  params.set('page', String(page))
  return request<FacilityPcPage>(`${BASE_URL}?${params}`)
}

export const fetchAllFacilityPcs = () => request<FacilityPc[]>(`${BASE_URL}/export`)

export const fetchFacilityPc = (id: number) => request<FacilityPc>(`${BASE_URL}/${id}`)

export const createFacilityPc = (input: FacilityPcInput) => request<FacilityPc>(BASE_URL, sendJson('POST', input))

export const updateFacilityPc = (id: number, input: FacilityPcInput) =>
  request<FacilityPc>(`${BASE_URL}/${id}`, sendJson('PUT', input))

export const deleteFacilityPc = (id: number) => request<void>(`${BASE_URL}/${id}`, { method: 'DELETE' })
