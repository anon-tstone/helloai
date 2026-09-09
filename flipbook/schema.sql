-- Flipbook Studio — D1 schema.
--
-- D1 holds queryable metadata only. Document JSON and uploaded media live in
-- R2 (no practical size ceiling), and published snapshots are mirrored into KV
-- for fast global reads.

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  title        TEXT NOT NULL,
  page_count   INTEGER NOT NULL DEFAULT 0,
  doc_key      TEXT NOT NULL,          -- R2 key holding the document JSON
  slug         TEXT UNIQUE,            -- set while published
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);

CREATE TABLE IF NOT EXISTS assets (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  name         TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size         INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  r2_key       TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets (owner_id, created_at DESC);
