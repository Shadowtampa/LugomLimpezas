-- Notas do ambiente (R13): ideias soltas, sem ligação com uma limpeza.
CREATE TABLE environment_notes (
  id          TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX environment_notes_environment ON environment_notes(environment);
