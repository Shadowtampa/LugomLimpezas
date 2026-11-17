import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { createApp } from './app.ts';
import { openDb } from './db.ts';

const seeds = resolve(import.meta.dirname, '../../pops');
const T0 = Date.parse('2026-01-01T12:00:00Z');

// App com SQLite em memória e pasta de POPs temporária com os POPs iniciais.
export function makeApp() {
  const popsDir = mkdtempSync(join(tmpdir(), 'pops-'));
  for (const f of ['escritorio.toon', 'banheiro-escritorio.toon']) copyFileSync(join(seeds, f), join(popsDir, f));
  const db = openDb(':memory:');
  const clock = { t: T0 };
  const agendaFile = join(mkdtempSync(join(tmpdir(), 'agenda-')), 'agenda.toon');
  return { app: createApp({ popsDir, db, agendaFile, now: () => clock.t }), db, popsDir, agendaFile, clock };
}
export type Ctx = ReturnType<typeof makeApp>;

// Evento do rascunho no segundo `sec` (a partir de um relógio fixo).
export const ev = (sec: number, tipo: string, atividade?: string) => ({ tipo, atividade, em: new Date(T0 + sec * 1000).toISOString() });

export const tasksOf = async (c: Ctx, slug = 'escritorio'): Promise<string[]> =>
  (await request(c.app).get(`/api/environments/${slug}/pop`)).body.etapas.flatMap((e: any) => e.atividades.map((a: any) => a.texto));

// O envio único: POST /api/cleanings com o rascunho inteiro.
export const submit = (c: Ctx, eventos: object[], opts: { slug?: string; status?: string; id?: string } = {}) =>
  request(c.app).post('/api/cleanings').send({ id: opts.id ?? randomUUID(), ambiente: opts.slug ?? 'escritorio', status: opts.status ?? 'concluida', eventos });

// Limpeza concluída: começa em 0 e marca todas as atividades no segundo `sec` (a primeira volta dura `sec`, as outras 0).
export async function finish(c: Ctx, sec: number, slug = 'escritorio') {
  const tasks = await tasksOf(c, slug);
  return submit(c, [ev(0, 'inicio'), ...tasks.map((t) => ev(sec, 'feito', t))], { slug });
}

// Limpeza abandonada no segundo `sec`, com as marcações dadas como [segundo, atividade].
export const abandoned = (c: Ctx, sec: number, marks: [number, string][] = [], slug = 'escritorio') =>
  submit(c, [ev(0, 'inicio'), ...marks.map(([s, t]) => ev(s, 'feito', t)), ev(sec, 'abandono')], { slug, status: 'abandonada' });
