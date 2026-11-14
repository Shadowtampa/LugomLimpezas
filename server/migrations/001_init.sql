CREATE TABLE cleanings (
  id            TEXT PRIMARY KEY,
  environment   TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  active_ms     INTEGER NOT NULL DEFAULT 0,
  running_since TEXT,
  total_ms      INTEGER
);

-- No máximo uma limpeza em andamento por ambiente (R3).
CREATE UNIQUE INDEX one_in_progress_per_environment ON cleanings(environment) WHERE status = 'in_progress';

CREATE TABLE cleaning_tasks (
  cleaning_id TEXT NOT NULL REFERENCES cleanings(id),
  task        TEXT NOT NULL,
  marked_ms   INTEGER NOT NULL,
  lap_ms      INTEGER NOT NULL,
  marked_at   TEXT NOT NULL,
  PRIMARY KEY (cleaning_id, task)
);

CREATE INDEX cleaning_tasks_task ON cleaning_tasks(task);
