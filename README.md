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

- 新しく環境を作るとき: Neon の SQL Editor で [db/schema.sql](db/schema.sql) を1回実行する
- 既存の環境を更新するとき: [db/migrations/](db/migrations/) の SQL を番号順に、本番・dev・test の各ブランチで実行する
  - **アプリをデプロイ（PR をマージ）する前に実行すること**。先にアプリを更新すると、DB の制約に弾かれたり、存在しない列を読みにいって一覧が表示できなくなったりする

### 更新の公開手順（DB の変更を伴うとき）

1. `db/migrations/` の新しい SQL を、本番・dev の各ブランチで実行する（test はテスト実行前に実行する）
2. PR をマージし、Cloudflare Pages のデプロイ完了を待つ
3. **利用者全員が、開いているこのシステムのタブをすべて再読み込み（F5）してから作業を再開する**
   - 公開前から開いていたタブには古い画面が残っており、そのまま編集・保存すると、古い画面が知らない項目（例: 002 で追加したアカウント登録日）が空欄で上書きされる

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
