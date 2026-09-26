# 施設PC管理

病院内のPCとOfficeライセンス情報を管理するWebシステム。設計は [docs/design/facility-management.md](docs/design/facility-management.md) を参照。

- 画面: Vite + React + TypeScript
- API: Hono（Cloudflare Pages Functions 上で動作）
- DB: Neon（PostgreSQL）
- 認証: Basic認証

## ローカル開発

```bash
npm install
cp .env.example .env        # DATABASE_URL などを設定する
npm run dev                 # 画面 http://localhost:5173 / API http://localhost:8787
```

ローカルでは wrangler を使わず、`server/dev.ts`（Node 上の Hono）で API を動かし、Vite が `/api` をそこへ転送する。ローカルでは Basic 認証はかからない。

### テスト

```bash
cp .env.test.example .env.test   # Neon のテスト用ブランチの接続文字列を設定する
npm test
```

- リポジトリ層のテストは `.env.test` の DB の `facility_pcs` を毎回全削除する。**本番ブランチの接続文字列を入れないこと**
- `.env.test` が無い場合、リポジトリ層のテストはスキップされる

## DB の準備

Neon の SQL Editor で [db/schema.sql](db/schema.sql) を1回実行する。

## Cloudflare Pages への公開

1. Cloudflare ダッシュボード → Workers & Pages → 作成 → Pages → Git に接続 → このリポジトリを選ぶ
2. ビルド設定
   - フレームワーク プリセット: なし（または Vite）
   - ビルドコマンド: `npm run build`
   - ビルド出力ディレクトリ: `dist`
   - Node.js のバージョンはリポジトリ直下の `.node-version` で指定している
3. 環境変数（本番）。いずれも「暗号化」を選ぶ
   - `DATABASE_URL`: Neon の本番ブランチの接続文字列
   - `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`: Basic 認証の ID / パスワード
4. 設定 → ランタイム（Runtime）→ Fail open / closed を **Fail closed** にする
   - Functions の無料枠の上限に達したとき、Fail open のままだと `_middleware.ts`（Basic 認証）を通らずに画面が配信されてしまう
5. 公開後、次を確認する
   - 4 の設定が Fail closed になっている
   - 画面を開くと Basic 認証のダイアログが出る（未設定のままだと誰も入れない）
   - 認証なしで `/api/facility-pcs` や `/index.html` にアクセスすると 401 になる
   - `/edit/1` などを直接開いても画面が表示される
