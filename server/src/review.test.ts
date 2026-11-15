import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

async function completed(c: ReturnType<typeof makeApp>) {
  const id = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
  const view = (await request(c.app).get(`/api/cleanings/${id}`)).body;
  for (const t of view.etapas.flatMap((e: any) => e.atividades.map((a: any) => a.text))) {
    c.clock.t += 1000;
    await request(c.app).put(`/api/cleanings/${id}/tasks`).send({ task: t, done: true });
  }
  return id as string;
}

describe('auto-avaliação da limpeza', () => {
  it('guarda nota e pontos a melhorar, aparece na limpeza e no histórico, e pode ser regravada', async () => {
    const c = makeApp();
    const id = await completed(c);
    expect((await request(c.app).get(`/api/cleanings/${id}`)).body.review).toBeNull();

    const put = (body: object) => request(c.app).put(`/api/cleanings/${id}/review`).send(body);
    const r = await put({ score: 7, improvements: '  Começar pelo piso.  ' });
    expect(r.status).toBe(200);
    expect(r.body.review).toEqual({ score: 7, improvements: 'Começar pelo piso.' });

    const hist = (await request(c.app).get('/api/environments/escritorio')).body.history;
    expect(hist[0].score).toBe(7);

    expect((await put({ score: 9 })).body.review).toEqual({ score: 9, improvements: '' });
  });

  it('recusa nota fora de 1–10 ou texto grande demais (400)', async () => {
    const c = makeApp();
    const id = await completed(c);
    const put = (body: object) => request(c.app).put(`/api/cleanings/${id}/review`).send(body);
    for (const bad of [{ score: 0 }, { score: 11 }, { score: 5.5 }, { score: '8' }, {}, { score: 5, improvements: 'x'.repeat(2001) }]) {
      expect((await put(bad)).status).toBe(400);
    }
  });

  it('só avalia limpeza concluída (409) e 404 para id inexistente', async () => {
    const c = makeApp();
    const open = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    expect((await request(c.app).put(`/api/cleanings/${open}/review`).send({ score: 5 })).status).toBe(409);
    expect((await request(c.app).put('/api/cleanings/nao-existe/review').send({ score: 5 })).status).toBe(404);
  });
});
