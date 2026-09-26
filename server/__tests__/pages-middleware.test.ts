import { onRequest } from '../../functions/_middleware'

// Pages Functions が渡してくる EventContext の最小限の偽物
const eventContext = (headers: Record<string, string> = {}) => {
  const next = vi.fn(async () => new Response('static asset'))
  const context = {
    request: new Request('https://example.pages.dev/index.html', { headers }),
    env: { BASIC_AUTH_USER: 'admin', BASIC_AUTH_PASSWORD: 'strong-password', ASSETS: { fetch } },
    next,
    functionPath: '/',
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
    params: {},
    data: {},
  }
  return { context, next }
}

describe('functions/_middleware（画面・APIを含む全リクエスト）', () => {
  it('認証なしなら 401 を返し、静的ファイルを渡さない', async () => {
    const { context, next } = eventContext()
    const res = await onRequest(context as never)
    expect(res.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('認証が通れば次の処理（静的ファイルや API）に進む', async () => {
    const { context, next } = eventContext({ Authorization: `Basic ${btoa('admin:strong-password')}` })
    const res = await onRequest(context as never)
    expect(await res.text()).toBe('static asset')
    expect(next).toHaveBeenCalled()
  })
})
