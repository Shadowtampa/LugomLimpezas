-- Um ambiente tem vários POPs (#39). O nome do ambiente passa a viver aqui; os POPs ficam em popsDir/<ambiente>/<pop>.toon.
-- As linhas são preenchidas na inicialização, junto com a mudança dos arquivos (environments.ts: migratePopsDir).
CREATE TABLE environments (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- A limpeza registra o POP usado; as antigas foram feitas com o único POP, que vira "completo".
ALTER TABLE cleanings ADD COLUMN pop TEXT NOT NULL DEFAULT 'completo';
