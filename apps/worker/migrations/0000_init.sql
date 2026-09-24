-- Migration schema for notebook_db

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  tags TEXT NOT NULL,
  completed_tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
