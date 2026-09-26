-- 全項目を任意入力にする（空欄は NULL で保存する）
-- 制約を緩めるだけなので既存データは変わらない。アプリの更新（デプロイ）より先に実行すること
-- Neon の SQL Editor で、本番・dev・test の各ブランチに1回ずつ実行する
ALTER TABLE facility_pcs
  ALTER COLUMN facility_name  DROP NOT NULL,
  ALTER COLUMN pc_name        DROP NOT NULL,
  ALTER COLUMN installed_on   DROP NOT NULL,
  ALTER COLUMN os_version     DROP NOT NULL,
  ALTER COLUMN office_type    DROP NOT NULL,
  ALTER COLUMN office_version DROP NOT NULL,
  ALTER COLUMN license_key    DROP NOT NULL,
  ALTER COLUMN account        DROP NOT NULL,
  ALTER COLUMN password       DROP NOT NULL;
