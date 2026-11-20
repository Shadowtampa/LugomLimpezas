import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { migratePopsDir } from './environments.ts';

const root = resolve(import.meta.dirname, '../..');
try { process.loadEnvFile(resolve(root, '.env')); } catch { /* .env é opcional */ }

const popsDir = resolve(root, process.env.POPS_DIR ?? 'data/pops');
const agendaFile = resolve(root, process.env.AGENDA_FILE ?? 'data/agenda.toon');
const dbPath = resolve(root, process.env.DATABASE_PATH ?? 'data/lugom.db');
const port = Number(process.env.PORT ?? 10061);

// Primeira inicialização: copia os POPs iniciais para a pasta em uso.
mkdirSync(popsDir, { recursive: true });
if (readdirSync(popsDir).length === 0 && existsSync(resolve(root, 'pops'))) {
  cpSync(resolve(root, 'pops'), popsDir, { recursive: true });
}

// A agenda inicial só é copiada se ainda não existir.
if (!existsSync(agendaFile) && existsSync(resolve(root, 'agenda.toon'))) {
  mkdirSync(dirname(agendaFile), { recursive: true });
  cpSync(resolve(root, 'agenda.toon'), agendaFile);
}

const db = openDb(dbPath);
migratePopsDir(db, popsDir);
createApp({ popsDir, db, agendaFile, clientDir: resolve(root, 'client/dist') })
  .listen(port, () => console.log(`Lugom Limpezas em http://localhost:${port}`));
