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
3. 環境変数（本番）。いずれも「暗号化」を選ぶ
   - `DATABASE_URL`: Neon の本番ブランチの接続文字列
   - `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`: Basic 認証の ID / パスワード
4. 公開後、次を確認する
   - 画面を開くと Basic 認証のダイアログが出る（未設定のままだと誰も入れない）
   - 認証なしで `/api/facility-pcs` や `/index.html` にアクセスすると 401 になる
   - `/edit/1` などを直接開いても画面が表示される

---

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
