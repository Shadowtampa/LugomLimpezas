import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, ev, finish, makeApp } from './testutil.ts';

const s = (n: number) => n * 1000;

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';

describe('abandonar', () => {
  it('grava como abandonada, com o tempo até ali e o fim', async () => {
    const c = makeApp();
    const r = await abandoned(c, 25);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'abandoned', running: false, activeMs: s(25), endedAt: ev(25, 'x').em });
    const row = c.db.prepare('SELECT total_ms FROM cleanings WHERE id = ?').get(r.body.id) as { total_ms: number };
    expect(row.total_ms).toBe(s(25));
  });

  it('as voltas da abandonada continuam valendo para os recordes', async () => {
    const c = makeApp();
    await abandoned(c, 30, [[25, A]]);
    expect((await request(c.app).get('/api/environments/escritorio/pops/completo/records')).body[A]).toBe(s(25));
  });
});

describe('excluir limpeza abandonada', () => {
  it('exclui só abandonada, apaga as voltas (e os recordes delas) e dá 404 depois', async () => {
    const c = makeApp();
    const first = (await abandoned(c, 40, [[30, A]])).body.id;
    const records = async () => (await request(c.app).get('/api/environments/escritorio/pops/completo/records')).body;
    expect(await records()).toEqual({ [A]: s(30) });

    expect((await request(c.app).delete(`/api/cleanings/${first}`)).status).toBe(204);
    expect((await request(c.app).get(`/api/cleanings/${first}`)).status).toBe(404);
    expect(await records()).toEqual({});
    expect((await request(c.app).get('/api/environments/escritorio')).body.history).toEqual([]);
    expect((await request(c.app).delete(`/api/cleanings/${first}`)).status).toBe(404);
  });

  it('não exclui limpeza concluída', async () => {
    const c = makeApp();
    const id = (await finish(c, 60, 'banheiro-escritorio')).body.id;
    expect((await request(c.app).delete(`/api/cleanings/${id}`)).status).toBe(409);
  });
});
