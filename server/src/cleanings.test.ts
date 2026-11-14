import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

const FIRST = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';
const SECOND = 'Recolher papéis, documentos e objetos espalhados.';

describe('iniciar e marcar', () => {
  it('inicia uma limpeza em andamento', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/environments/escritorio/cleanings');
    expect(r.status).toBe(201);
    const c = await request(app).get(`/api/cleanings/${r.body.id}`);
    expect(c.body.status).toBe('in_progress');
    expect(c.body.progress).toEqual({ done: 0, total: 31 });
    expect(c.body.etapas[0].atividades[0]).toEqual({ text: FIRST, done: false });
    const env = await request(app).get('/api/environments/escritorio');
    expect(env.body.inProgress.id).toBe(r.body.id);
  });

  it('marca, desmarca e repetir não muda nada', async () => {
    const { app } = makeApp();
    const { id } = (await request(app).post('/api/environments/escritorio/cleanings')).body;
    const put = (task: string, done: boolean) => request(app).put(`/api/cleanings/${id}/tasks`).send({ task, done });
    expect((await put(SECOND, true)).body.progress.done).toBe(1); // fora de ordem
    expect((await put(SECOND, true)).body.progress.done).toBe(1);
    expect((await put(SECOND, false)).body.progress.done).toBe(0);
    expect((await put(SECOND, false)).body.progress.done).toBe(0);
  });

  it('recusa atividade que não está no POP e corpo inválido', async () => {
    const { app } = makeApp();
    const { id } = (await request(app).post('/api/environments/escritorio/cleanings')).body;
    expect((await request(app).put(`/api/cleanings/${id}/tasks`).send({ task: 'inventada', done: true })).status).toBe(400);
    expect((await request(app).put(`/api/cleanings/${id}/tasks`).send({ task: FIRST })).status).toBe(400);
  });

  it('segunda limpeza no mesmo ambiente responde 409; ambientes são independentes', async () => {
    const { app } = makeApp();
    await request(app).post('/api/environments/escritorio/cleanings');
    expect((await request(app).post('/api/environments/escritorio/cleanings')).status).toBe(409);
    expect((await request(app).post('/api/environments/banheiro-escritorio/cleanings')).status).toBe(201);
  });

  it('ambiente inexistente ou com slug malicioso é 404', async () => {
    const { app } = makeApp();
    expect((await request(app).post('/api/environments/nada/cleanings')).status).toBe(404);
    expect((await request(app).get('/api/environments/..%2Fx')).status).toBe(404);
    expect((await request(app).get('/api/cleanings/nada')).status).toBe(404);
  });
});
