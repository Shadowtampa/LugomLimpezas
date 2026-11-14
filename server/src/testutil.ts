import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';

const seeds = resolve(import.meta.dirname, '../../pops');

// App com SQLite em memória e uma pasta de POPs temporária com os POPs iniciais.
export function makeApp() {
  const popsDir = mkdtempSync(join(tmpdir(), 'pops-'));
  for (const f of ['escritorio.toon', 'banheiro-escritorio.toon']) copyFileSync(join(seeds, f), join(popsDir, f));
  const db = openDb(':memory:');
  return { app: createApp({ popsDir, db }), db, popsDir };
}
