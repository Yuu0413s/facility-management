-- Tag（任意の自由入力）の列を追加する。大文字・小文字を区別せずに重複を禁止する（NULL どうしは重複とみなさない）
-- 既存の行は空欄（NULL）のまま。002 の実行後に、アプリの更新（デプロイ）より先に実行すること
-- Neon の SQL Editor で、本番・dev・test の各ブランチに1回ずつ実行する
ALTER TABLE facility_pcs ADD COLUMN tag TEXT;
CREATE UNIQUE INDEX facility_pcs_tag_lower_key ON facility_pcs (lower(tag));
