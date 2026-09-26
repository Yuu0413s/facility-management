import { Hono } from 'hono'
import { createBasicAuth } from './basic-auth'

const app = new Hono().use(createBasicAuth()).get('/', (c) => c.text('ok'))

const authHeader = (user: string, password: string) => ({ Authorization: `Basic ${btoa(`${user}:${password}`)}` })
const env = { BASIC_AUTH_USER: 'admin', BASIC_AUTH_PASSWORD: 'strong-password' }

describe('createBasicAuth', () => {
  it('正しいID/パスワードなら通す', async () => {
    const res = await app.request('/', { headers: authHeader('admin', 'strong-password') }, env)
    expect(res.status).toBe(200)
  })

  it('認証情報がなければ 401 とブラウザのログインダイアログ用ヘッダを返す', async () => {
    const res = await app.request('/', {}, env)
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic/)
  })

  it.each([
    ['admin', 'wrong'],
    ['wrong', 'strong-password'],
  ])('ID=%s / パスワード=%s は 401', async (user, password) => {
    const res = await app.request('/', { headers: authHeader(user, password) }, env)
    expect(res.status).toBe(401)
  })

  it('環境変数が未設定なら、空のID/パスワードでも通さない', async () => {
    const res = await app.request('/', { headers: authHeader('', '') }, {})
    expect(res.status).toBe(401)
  })
})
