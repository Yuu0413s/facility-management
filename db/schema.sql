-- Neon の SQL Editor で1回だけ実行する（本番ブランチ・テスト用ブランチの両方）
CREATE TABLE facility_pcs (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_name   TEXT NOT NULL,
  pc_name         TEXT NOT NULL,
  installed_on    DATE NOT NULL,
  os_version      TEXT NOT NULL,
  office_type     TEXT NOT NULL CHECK (office_type IN ('Personal', 'H&B', 'Pro', 'Access')),
  office_version  TEXT NOT NULL CHECK (office_version IN ('2010', '2013', '2016', '2019', '2021', '2024')),
  license_key     TEXT NOT NULL,
  account         TEXT NOT NULL,
  password        TEXT NOT NULL,
  remarks         TEXT CHECK (char_length(remarks) <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_name, pc_name)
);
