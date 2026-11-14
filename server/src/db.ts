import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = join(import.meta.dirname, '../migrations');

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

// Arquivos NNN_nome.sql; aplica os de número acima de PRAGMA user_version.
function migrate(db: DatabaseSync) {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    const n = parseInt(f, 10);
    if (n <= current) continue;
    transaction(db, () => {
      db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
      db.exec(`PRAGMA user_version = ${n}`);
    });
  }
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
