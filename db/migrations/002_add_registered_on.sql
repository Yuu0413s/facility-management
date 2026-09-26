-- アカウント登録日（手入力の任意項目）の列を追加する
-- 既存の行は空欄（NULL）のまま。created_at（DB に登録した日時）とは意味が違うため写さない
-- 001 の実行後に、アプリの更新（デプロイ）より先に実行すること
-- Neon の SQL Editor で、本番・dev・test の各ブランチに1回ずつ実行する
ALTER TABLE facility_pcs ADD COLUMN registered_on DATE;
