import { basicAuth } from 'hono/basic-auth'
import { timingSafeEqual } from 'hono/utils/buffer'

type AuthBindings = { BASIC_AUTH_USER?: string; BASIC_AUTH_PASSWORD?: string }

// 認証情報は Cloudflare の環境変数から読む。未設定のときは誰も通さない（設定漏れで無防備にならないように）
export const createBasicAuth = () =>
  basicAuth({
    realm: 'facility-management',
    verifyUser: async (user, password, c) => {
      const { BASIC_AUTH_USER: expectedUser, BASIC_AUTH_PASSWORD: expectedPassword } = (c.env ?? {}) as AuthBindings
      if (!expectedUser || !expectedPassword) return false

      // 両方とも必ず比較し、どちらで失敗したかを応答時間から推測されないようにする
      const [userMatches, passwordMatches] = await Promise.all([
        timingSafeEqual(user, expectedUser),
        timingSafeEqual(password, expectedPassword),
      ])
      return userMatches && passwordMatches
    },
  })
