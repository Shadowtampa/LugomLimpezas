import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, ev, finish, makeApp, submit, tasksOf } from './testutil.ts';

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';
const B = 'Recolher papéis, documentos e objetos espalhados.';
const s = (n: number) => n * 1000;
const lap = (v: any, task: string) => v.etapas.flatMap((e: any) => e.atividades).find((a: any) => a.text === task)?.lapMs;

describe('envio único da limpeza (POST /api/cleanings)', () => {
  it('conclui: o servidor recalcula o tempo total e as voltas a partir dos eventos', async () => {
    const c = makeApp();
    const r = await finish(c, 100);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'completed', running: false, result: { totalMs: s(100), newRecord: true, fastestOtherMs: null } });
    expect(r.body.endedAt).toBe(ev(100, 'x').em);
    expect(r.body.progress).toEqual({ done: 31, total: 31 });
    expect(lap(r.body, A)).toBe(s(100));
    const env = (await request(c.app).get('/api/environments/escritorio')).body;
    expect(env.fastestMs).toBe(s(100));
    expect(env.history[0]).toMatchObject({ status: 'completed', totalMs: s(100), done: 31, total: 31 });
  });

  it('a volta desconta pausas e conta desde a marcação mais recente, inclusive fora de ordem', async () => {
    const c = makeApp();
    const r = await submit(c, [ev(0, 'inicio'), ev(10, 'pausa'), ev(110, 'retomada'), ev(115, 'feito', B), ev(125, 'feito', A), ev(130, 'abandono')], { status: 'abandonada' });
    expect(lap(r.body, B)).toBe(s(15)); // 10 antes da pausa + 5 depois; os 100s parados não contam
    expect(lap(r.body, A)).toBe(s(10));
    expect(r.body).toMatchObject({ status: 'abandoned', activeMs: s(30) });
  });

  it('pausar e retomar repetidos não mudam nada', async () => {
    const c = makeApp();
    const r = await submit(c, [ev(0, 'inicio'), ev(10, 'pausa'), ev(60, 'pausa'), ev(70, 'retomada'), ev(75, 'retomada'), ev(80, 'abandono')], { status: 'abandonada' });
    expect(r.body.activeMs).toBe(s(10 + 10));
  });

  it('desmarcar apaga a volta, e a próxima conta desde a anterior ainda marcada', async () => {
    const c = makeApp();
    const r = await submit(c, [ev(0, 'inicio'), ev(20, 'feito', A), ev(30, 'desmarcar', A), ev(35, 'feito', B), ev(35, 'abandono')], { status: 'abandonada' });
    expect(lap(r.body, A)).toBeUndefined();
    expect(lap(r.body, B)).toBe(s(35));
  });

  it('marcar de novo uma atividade marcada não muda a volta', async () => {
    const c = makeApp();
    const r = await submit(c, [ev(0, 'inicio'), ev(20, 'feito', A), ev(30, 'feito', A), ev(30, 'abandono')], { status: 'abandonada' });
    expect(lap(r.body, A)).toBe(s(20));
    expect(r.body.progress.done).toBe(1);
  });

  it('desmarcar depois de tudo marcado e marcar de novo conclui com o tempo da última marcação', async () => {
    const c = makeApp();
    const tasks = await tasksOf(c);
    const r = await submit(c, [ev(0, 'inicio'), ...tasks.map((t) => ev(100, 'feito', t)), ev(110, 'desmarcar', B), ev(150, 'feito', B)]);
    expect(r.body.result.totalMs).toBe(s(150));
  });

  it('é idempotente pelo id: reenviar devolve a limpeza gravada, sem duplicar', async () => {
    const c = makeApp();
    const id = 'aaaaaaaa-0000-4000-8000-000000000001';
    const tasks = await tasksOf(c);
    const eventos = [ev(0, 'inicio'), ...tasks.map((t) => ev(60, 'feito', t))];
    expect((await submit(c, eventos, { id })).status).toBe(201);
    const again = await submit(c, eventos, { id });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id, status: 'completed' });
    expect((c.db.prepare('SELECT COUNT(*) AS n FROM cleanings').get() as { n: number }).n).toBe(1);
    expect((await submit(c, eventos, { id, slug: 'banheiro-escritorio' })).status).toBe(409);
  });

  it('diz concluída mas falta atividade: grava como abandonada, com o que foi feito', async () => {
    const c = makeApp();
    const r = await submit(c, [ev(0, 'inicio'), ev(40, 'feito', A), ev(50, 'feito', B)]);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'abandoned', activeMs: s(50), result: null, progress: { done: 2, total: 31 } });
  });

  it('abandonar guarda o tempo e as voltas (valem para os recordes)', async () => {
    const c = makeApp();
    const r = await abandoned(c, 40, [[25, A]]);
    expect(r.body).toMatchObject({ status: 'abandoned', activeMs: s(40) });
    expect((await request(c.app).get('/api/environments/escritorio/records')).body).toEqual({ [A]: s(25) });
  });

  it('ignora atividade que não existe mais no POP', async () => {
    const c = makeApp();
    const r = await submit(c, [ev(0, 'inicio'), ev(5, 'feito', 'inventada'), ev(6, 'feito', A), ev(7, 'abandono')], { status: 'abandonada' });
    expect(r.body.progress.done).toBe(1);
    expect((c.db.prepare('SELECT COUNT(*) AS n FROM cleaning_tasks').get() as { n: number }).n).toBe(1);
  });

  it('POP editado no meio: concluída exige todas as atividades do POP atual', async () => {
    const c = makeApp();
    const tasks = await tasksOf(c);
    const file = join(c.popsDir, 'escritorio.toon');
    writeFileSync(file, readFileSync(file, 'utf8').replace(A, 'Texto novo da atividade.'));
    expect((await submit(c, [ev(0, 'inicio'), ...tasks.map((t) => ev(9, 'feito', t))])).body.status).toBe('abandoned');
    expect((await submit(c, [ev(0, 'inicio'), ...tasks.slice(1).map((t) => ev(9, 'feito', t)), ev(9, 'feito', 'Texto novo da atividade.')])).body.status).toBe('completed');
  });

  it('recusa envio inválido: 400 para corpo, ordem e início; 404 para ambiente', async () => {
    const c = makeApp();
    const bad = (body: object) => request(c.app).post('/api/cleanings').send(body);
    const ok = { id: 'aaaaaaaa-0000-4000-8000-000000000002', ambiente: 'escritorio', status: 'concluida', eventos: [ev(0, 'inicio')] };
    expect((await bad({ ...ok, eventos: [] })).status).toBe(400);
    expect((await bad({ ...ok, id: 'x' })).status).toBe(400);
    expect((await bad({ ...ok, status: 'em_andamento' })).status).toBe(400);
    expect((await bad({ ...ok, eventos: [{ tipo: 'inicio', em: 'ontem' }] })).status).toBe(400);
    expect((await bad({ ...ok, eventos: [ev(0, 'feito', A)] })).status).toBe(400); // não começa com inicio
    expect((await bad({ ...ok, eventos: [ev(0, 'inicio'), ev(5, 'inicio')] })).status).toBe(400);
    expect((await bad({ ...ok, eventos: [ev(0, 'inicio'), ev(10, 'feito', A), ev(5, 'feito', B)] })).status).toBe(400); // fora de ordem
    expect((await bad({ ...ok, eventos: [ev(0, 'inicio'), ev(1, 'feito')] })).status).toBe(400); // sem atividade
    expect((await bad({ ...ok, eventos: [ev(0, 'inicio'), ev(3 * 86400, 'pausa')] })).status).toBe(400); // 3 dias no futuro
    expect((await bad({ ...ok, eventos: Array.from({ length: 1001 }, (_, i) => ev(i, i ? 'pausa' : 'inicio')) })).status).toBe(400);
    expect((await bad({ ...ok, ambiente: 'nada' })).status).toBe(404);
    expect((await bad({ ...ok, ambiente: '..%2Fx' })).status).toBe(404);
    expect((c.db.prepare('SELECT COUNT(*) AS n FROM cleanings').get() as { n: number }).n).toBe(0);
  });
});

describe('recordes e migração', () => {
  it('GET /environments/:slug/records: menor volta por atividade entre todas as limpezas do ambiente', async () => {
    const c = makeApp();
    await abandoned(c, 60, [[30, A]]);
    await abandoned(c, 60, [[20, A], [50, B]]);
    expect((await request(c.app).get('/api/environments/escritorio/records')).body).toEqual({ [A]: s(20), [B]: s(30) });
    expect((await request(c.app).get('/api/environments/banheiro-escritorio/records')).body).toEqual({});
    expect((await request(c.app).get('/api/environments/nada/records')).status).toBe(404);
  });

  it('a migração 004 abandona as limpezas que estavam em andamento no servidor', () => {
    const c = makeApp();
    c.db.prepare("INSERT INTO cleanings (id, environment, status, started_at, active_ms, running_since) VALUES ('a', 'escritorio', 'in_progress', '2026-01-01T12:00:00.000Z', 5000, NULL)").run();
    c.db.exec(readFileSync(resolve(import.meta.dirname, '../migrations/004_drafts_in_browser.sql'), 'utf8'));
    expect(c.db.prepare("SELECT status, total_ms, ended_at IS NOT NULL AS ended FROM cleanings WHERE id = 'a'").get()).toMatchObject({ status: 'abandoned', total_ms: 5000, ended: 1 });
  });
});
