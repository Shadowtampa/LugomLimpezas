import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';
const s = (n: number) => n * 1000;

describe('abandonar ao iniciar outra', () => {
  it('sem a confirmação responde 409 e nada muda', async () => {
    const c = makeApp();
    const first = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    const r = await request(c.app).post('/api/environments/escritorio/cleanings').send({});
    expect(r.status).toBe(409);
    expect(r.body.currentId).toBe(first);
    expect((await request(c.app).get(`/api/cleanings/${first}`)).body.status).toBe('in_progress');
  });

  it('com a confirmação abandona a anterior (com o tempo até ali) e cria a nova', async () => {
    const c = makeApp();
    const first = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    c.clock.t += s(40);
    const second = await request(c.app).post('/api/environments/escritorio/cleanings').send({ abandonCurrent: true });
    expect(second.status).toBe(201);
    const old = (await request(c.app).get(`/api/cleanings/${first}`)).body;
    expect(old).toMatchObject({ status: 'abandoned', running: false, activeMs: s(40) });
    expect(old.endedAt).toBeTruthy();
    expect((await request(c.app).get('/api/environments/escritorio')).body.inProgress.id).toBe(second.body.id);
    c.clock.t += s(100); // a abandonada não corre mais
    expect((await request(c.app).get(`/api/cleanings/${first}`)).body.activeMs).toBe(s(40));
    const row = c.db.prepare('SELECT total_ms FROM cleanings WHERE id = ?').get(first) as { total_ms: number };
    expect(row.total_ms).toBe(s(40));
  });

  it('uma limpeza abandonada recusa marcações, pausa e retomada', async () => {
    const c = makeApp();
    const first = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    await request(c.app).post('/api/environments/escritorio/cleanings').send({ abandonCurrent: true });
    expect((await request(c.app).put(`/api/cleanings/${first}/tasks`).send({ task: A, done: true })).status).toBe(409);
    expect((await request(c.app).post(`/api/cleanings/${first}/pause`)).status).toBe(409);
    expect((await request(c.app).post(`/api/cleanings/${first}/resume`)).status).toBe(409);
  });

  it('o banco recusa duas em andamento no mesmo ambiente', async () => {
    const c = makeApp();
    await request(c.app).post('/api/environments/escritorio/cleanings');
    const dup = () => c.db.prepare("INSERT INTO cleanings (id, environment, status, started_at) VALUES ('x', 'escritorio', 'in_progress', 'now')").run();
    expect(dup).toThrow(/UNIQUE/);
  });

  it('as voltas da abandonada continuam valendo para os recordes', async () => {
    const c = makeApp();
    const first = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    c.clock.t += s(25);
    await request(c.app).put(`/api/cleanings/${first}/tasks`).send({ task: A, done: true });
    const second = (await request(c.app).post('/api/environments/escritorio/cleanings').send({ abandonCurrent: true })).body.id;
    const v = (await request(c.app).get(`/api/cleanings/${second}`)).body;
    expect(v.etapas[0].atividades[0].recordMs).toBe(s(25));
  });
});

describe('abandonar explicitamente', () => {
  it('abandona a limpeza em andamento guardando o tempo, libera o ambiente e não aceita mais marcações', async () => {
    const c = makeApp();
    const id = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    c.clock.t += s(25);
    const r = await request(c.app).post(`/api/cleanings/${id}/abandon`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'abandoned', running: false, activeMs: s(25) });
    c.clock.t += s(100);
    expect((await request(c.app).get(`/api/cleanings/${id}`)).body.activeMs).toBe(s(25));
    expect((await request(c.app).get('/api/environments/escritorio')).body.inProgress).toBeNull();
    expect((await request(c.app).put(`/api/cleanings/${id}/tasks`).send({ task: A, done: true })).status).toBe(409);
    expect((await request(c.app).post('/api/environments/escritorio/cleanings')).status).toBe(201);
  });

  it('409 se já não está em andamento e 404 se não existe', async () => {
    const c = makeApp();
    const id = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    await request(c.app).post(`/api/cleanings/${id}/abandon`);
    expect((await request(c.app).post(`/api/cleanings/${id}/abandon`)).status).toBe(409);
    expect((await request(c.app).post('/api/cleanings/nao-existe/abandon')).status).toBe(404);
  });
});
