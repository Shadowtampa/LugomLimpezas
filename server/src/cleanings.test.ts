import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, ev, finish, makeApp, submit } from './testutil.ts';

const FIRST = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';

describe('limpeza gravada', () => {
  it('a limpeza enviada aparece na leitura com todas as atividades e no histórico do ambiente', async () => {
    const c = makeApp();
    const r = await abandoned(c, 30);
    const v = await request(c.app).get(`/api/cleanings/${r.body.id}`);
    expect(v.body.status).toBe('abandoned');
    expect(v.body.progress).toEqual({ done: 0, total: 31 });
    expect(v.body.etapas[0].atividades[0]).toEqual({ text: FIRST, done: false });
    const env = await request(c.app).get('/api/environments/escritorio');
    expect(env.body.pops).toMatchObject([{ slug: 'completo', name: 'Completo', total: 31 }]);
    expect(env.body.history.map((h: any) => h.id)).toEqual([r.body.id]);
  });

  it('o servidor não guarda limpeza em andamento: o ambiente não tem inProgress', async () => {
    const c = makeApp();
    await submit(c, [ev(0, 'inicio'), ev(5, 'feito', FIRST)], { status: 'abandonada' });
    expect((await request(c.app).get('/api/environments/escritorio')).body.inProgress).toBeUndefined();
  });

  it('ambiente inexistente ou com slug malicioso é 404', async () => {
    const c = makeApp();
    expect((await submit(c, [ev(0, 'inicio')], { slug: 'nada' })).status).toBe(404);
    expect((await request(c.app).get('/api/environments/..%2Fx')).status).toBe(404);
    expect((await request(c.app).get('/api/cleanings/nada')).status).toBe(404);
  });

  it('ambientes são independentes', async () => {
    const c = makeApp();
    expect((await finish(c, 10)).status).toBe(201);
    expect((await finish(c, 10, 'banheiro-escritorio')).status).toBe(201);
  });
});
