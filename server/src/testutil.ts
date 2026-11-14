import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';

const seeds = resolve(import.meta.dirname, '../../pops');

// App com SQLite em memória, pasta de POPs temporária com os POPs iniciais e relógio controlável.
export function makeApp() {
  const popsDir = mkdtempSync(join(tmpdir(), 'pops-'));
  for (const f of ['escritorio.toon', 'banheiro-escritorio.toon']) copyFileSync(join(seeds, f), join(popsDir, f));
  const db = openDb(':memory:');
  const clock = { t: Date.parse('2026-01-01T12:00:00Z') };
  return { app: createApp({ popsDir, db, now: () => clock.t }), db, popsDir, clock };
}
