-- 新しく環境を作るときに Neon の SQL Editor で1回だけ実行する。
-- 既存の環境は db/migrations/ を番号順に実行して、この定義に合わせる。
-- 全項目が任意入力（空欄は NULL）。全項目が空欄の行はアプリ側で防ぐ
CREATE TABLE facility_pcs (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_name   TEXT,
  pc_name         TEXT,
  installed_on    DATE,
  os_version      TEXT,
  office_type     TEXT CHECK (office_type IN ('Personal', 'H&B', 'Pro', 'Access')),
  office_version  TEXT CHECK (office_version IN ('2010', '2013', '2016', '2019', '2021', '2024')),
  license_key     TEXT,
  account         TEXT,
  password        TEXT,
  remarks         TEXT CHECK (char_length(remarks) <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_name, pc_name)
);
