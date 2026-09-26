# 施設PC管理システム 設計メモ

## 1. 目的

病院内に設置したPCとOfficeライセンス情報（アカウント・Key含む）を一元管理し、施設ごとに素早く参照できるようにする。

## 2. ユーザー

- 社内の2名
- 権限の区別なし（2名とも閲覧・登録・編集・削除が可能）
- 認証: Basic認証（共通ID/パスワード1組。Cloudflareの環境変数で管理）

## 3. 課題

- 現在は管理していない。管理するために本システムを作成する
- 既存データの取り込み機能は不要

## 4. 機能

### MVPに含める

| 機能 | 仕様 |
|---|---|
| 登録 | 11項目を入力して登録 |
| 一覧表示 | 表形式。PCのみ対応（収まらない場合は横スクロール） |
| 編集 | 登録済みデータの修正 |
| 削除 | 確認ダイアログあり |
| ソート | 施設名のみ。列見出しクリックで昇順／降順を切り替え。並び順は文字コード順（五十音順ではない）。同じ施設名どうしはPC名の昇順 |
| 検索 | 施設名の部分一致。検索語を変えたら1ページ目に戻る |
| ページ分割 | 1ページ50件 |
| パスワード・Keyの表示 | 「●●●●」で隠し、クリックで表示 |
| Excel出力 | `.xlsx`。「Excel出力」ボタンのメニューから2種類を選ぶ。どちらも常に全件（施設名→PC名順）<br>・全件出力：全10項目（パスワード・Keyも含める）。`施設PC一覧_yyyymmdd.xlsx`<br>・アカウント情報出力：PC名・アカウント・パスワードの3列。`アカウント情報_yyyymmdd.xlsx` |

### MVPに含めない

- PC名など施設名以外での検索・ソート
- 変更履歴
- 同時編集の検知（後から保存した内容で上書き。利用者2名のため許容）
- ログアウト機能・利用者ごとの識別（Basic認証のため。許容）
- 既存データの一括取り込み

## 5. 画面構成

2ページ構成（`react-router`）。

```
一覧ページ  /
  ├── [新規登録] → 登録ページ  /new
  ├── [編集]     → 編集ページ  /edit/:id
  ├── [削除]     → 確認ダイアログ → 一覧を再取得
  └── [Excel出力] → 全件出力 / アカウント情報出力 を選んで .xlsx をダウンロード

登録・編集ページ
  └── [保存] → 一覧ページへ戻る
```

設置日の入力欄: テキスト入力（`yyyy/mm/dd`）＋ カレンダーボタン（ブラウザ標準の日付選択を開く）。ライブラリは使わない。

## 6. データ構造

```sql
CREATE TABLE facility_pcs (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_name   TEXT NOT NULL,
  pc_name         TEXT NOT NULL,
  installed_on    DATE NOT NULL,
  os_version      TEXT NOT NULL,
  office_type     TEXT NOT NULL CHECK (office_type IN ('Personal','H&B','Pro','Access')),
  office_version  TEXT NOT NULL CHECK (office_version IN ('2010','2013','2016','2019','2021','2024')),
  license_key     TEXT NOT NULL,
  account         TEXT NOT NULL,
  password        TEXT NOT NULL,
  remarks         TEXT CHECK (char_length(remarks) <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_name, pc_name)
);
```

| 決定事項 | 内容 |
|---|---|
| テーブル構成 | 1テーブルのみ。リレーションなし |
| ID | 連番 |
| 必須項目 | 備考以外すべて |
| 重複 | 「施設名＋PC名」の組み合わせの重複を禁止 |
| 空白 | 保存前に前後の空白を除去（重複判定をすり抜けないため） |
| 備考 | 複数行可、500文字以内 |
| パスワード | 平文で保存 |
| 登録・更新日時 | DBに記録する（画面には表示しない）。`updated_at` は UPDATE 文で `now()` を設定 |
| マイグレーション | ツールは使わない。`db/schema.sql` を Neon の SQL Editor で実行 |

## 7. API設計

ベースURL: `/api/facility-pcs`

| メソッド | URL | 用途 | 成功 | 失敗 |
|---|---|---|---|---|
| GET | `/api/facility-pcs?q=&order=&page=` | 一覧（検索・ソート・ページ分割） | 200 | 400 |
| GET | `/api/facility-pcs/export` | 全件取得（Excel出力用） | 200 | - |
| GET | `/api/facility-pcs/:id` | 1件取得（編集ページ） | 200 | 404 |
| POST | `/api/facility-pcs` | 登録 | 201 | 400 / 409 |
| PUT | `/api/facility-pcs/:id` | 更新 | 200 | 400 / 404 / 409 |
| DELETE | `/api/facility-pcs/:id` | 削除 | 204 | 404 |

一覧のクエリパラメータ:

| パラメータ | 意味 | 既定値 |
|---|---|---|
| `q` | 施設名の部分一致（`%` `_` はエスケープ） | なし |
| `order` | `asc` / `desc` | `asc` |
| `page` | 1始まり | `1` |

一覧のレスポンス:

```json
{
  "items": [{ "id": 1, "facilityName": "中央病院", "...": "..." }],
  "total": 123,
  "page": 2,
  "perPage": 50
}
```

- 日付はAPIでは `yyyy-mm-dd`、画面表示は `yyyy/mm/dd`
- 入力チェックは Zod（`@hono/zod-validator`）。スキーマは画面とサーバーで共用
- Excel（`.xlsx`）はブラウザ側で ExcelJS を使って生成（出力時のみ動的import）

## 8. フォルダ構成

技術スタック: Vite + React + TypeScript / Hono / Neon（`@neondatabase/serverless`）/ Zod / ExcelJS / Vitest / Cloudflare Pages（GitHub連携、wranglerなし）

ファイル命名: Reactコンポーネントは PascalCase、それ以外は kebab-case

```
facility-management/
├── functions/                       Cloudflare Pages Functions（本番の入口）
│   ├── _middleware.ts               Basic認証（画面・APIのすべてを保護）
│   └── api/
│       └── [[route]].ts             Honoアプリを Pages に渡すだけ
├── server/
│   ├── app.ts                       Honoアプリ本体
│   ├── routes/
│   │   └── facility-pcs.ts
│   ├── db/
│   │   └── facility-pcs-repository.ts   SQLはここだけ
│   ├── dev.ts                       ローカル開発用Nodeサーバー
│   └── __tests__/
├── shared/
│   └── facility-pc-schema.ts        Zodスキーマ（画面・サーバー共用）
├── src/
│   ├── main.tsx
│   ├── App.tsx                      ルーティング
│   ├── pages/
│   │   ├── FacilityPcListPage.tsx
│   │   └── FacilityPcFormPage.tsx
│   ├── components/
│   │   ├── SecretCell.tsx
│   │   └── Pagination.tsx
│   ├── api/
│   │   └── facility-pcs-client.ts
│   └── lib/
│       ├── export-excel.ts
│       └── date.ts
├── db/
│   └── schema.sql
├── docs/design/
│   └── facility-management.md
├── index.html
├── vite.config.ts                   開発時は /api を dev.ts へプロキシ
└── package.json
```

環境変数（Cloudflare Pages / ローカルの `.env`）:

| 名前 | 用途 |
|---|---|
| `DATABASE_URL` | Neon接続文字列 |
| `BASIC_AUTH_USER` | Basic認証ID |
| `BASIC_AUTH_PASSWORD` | Basic認証パスワード |

テスト方針: APIはリポジトリ層をモックに差し替えてテスト。リポジトリ層（SQL）はNeonのテスト用ブランチで確認。

## 9. 実装手順

| # | 作業 | 進め方 |
|---|---|---|
| 0 | Vite + TypeScript + Vitest の土台（CRA撤去） | scaffold（既存ファイル置き換えは承認後） |
| 1 | Neonプロジェクト・テスト用ブランチ作成、`schema.sql` 実行 | 手作業 |
| 2 | Zodスキーマ（空白除去・500文字・日付妥当性） | TDD |
| 3 | リポジトリ層（一覧・検索・ソート・ページ分割・CRUD・全件） | TDD（テスト用ブランチ） |
| 4 | Hono API 6本（400/404/409含む） | TDD（モック） |
| 5 | Basic認証、`functions/` 入口、ローカル開発サーバー | TDD＋動作確認 |
| 6 | 一覧ページ（検索・ソート・ページ分割・●●●●表示・削除） | TDD |
| 7 | 登録・編集ページ（設置日入力・プルダウン・備考） | TDD |
| 8 | Excel出力 | TDD |
| 9 | Cloudflare Pages 公開（環境変数設定・本番確認） | 手作業＋確認 |

1 Issue = 1 PR を基本とする。

## 10. リスク

| # | リスク | 対策・判断 |
|---|---|---|
| 1 | `_middleware` のBasic認証が静的ファイルにも効くか。Functions の上限到達時に Fail open だと認証なしで配信される | Pages の設定を Fail closed にする。公開後にブラウザで確認する |
| 2 | wranglerなしのためローカルと本番の実行環境が異なる | Cloudflare依存を `functions/` に隔離。公開後の動作確認を必須にする |
| 3 | Neonの休止からの復帰で初回表示が遅れる | 許容 |
| 4 | 同時編集で後勝ち上書き | 許容（利用者2名） |
| 5 | パスワード・Keyを平文保存・Excel出力 | Basic認証を強いパスワードにする。Excelの保管は運用で対処 |
| 6 | Basic認証は共通アカウント・ログアウトなし | 許容（利用者2名） |
| 7 | 検索語の `%` `_` がワイルドカード扱いになる | エスケープしてテストで確認 |
| 8 | 無料プランの上限（値は不確か） | 2名利用なら収まる想定 |
| 9 | Cloudflareが Pages より Workers を推す方向（不確か） | `server/app.ts` を独立させ、`functions/` の差し替えだけで移行できるようにする |
