import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';
const s = (n: number) => n * 1000;

describe('histórico do ambiente', () => {
  it('lista da mais recente para a mais antiga, com status, tempo e progresso', async () => {
    const c = makeApp();
    const hist = async () => (await request(c.app).get('/api/environments/escritorio')).body.history;
    expect(await hist()).toEqual([]);

    const first = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    c.clock.t += s(30);
    await request(c.app).put(`/api/cleanings/${first}/tasks`).send({ task: A, done: true });
    c.clock.t += s(10);
    const second = (await request(c.app).post('/api/environments/escritorio/cleanings').send({ abandonCurrent: true })).body.id;
    c.clock.t += s(7); // em andamento: tempo corrido

    const h = await hist();
    expect(h.map((x: any) => x.id)).toEqual([second, first]);
    expect(h[0]).toMatchObject({ status: 'in_progress', totalMs: s(7), done: 0, total: 31 });
    expect(h[1]).toMatchObject({ status: 'abandoned', totalMs: s(40), done: 1, total: 31 });
  });

  it('concluída mostra o tempo total; o progresso usa o POP atual (texto editado ou removido não conta)', async () => {
    const c = makeApp();
    const id = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    c.clock.t += s(5);
    await request(c.app).put(`/api/cleanings/${id}/tasks`).send({ task: A, done: true });
    const file = join(c.popsDir, 'escritorio.toon');
    writeFileSync(file, readFileSync(file, 'utf8').replace(A, 'Texto novo da atividade.'));
    const h = (await request(c.app).get('/api/environments/escritorio')).body.history;
    expect(h[0]).toMatchObject({ done: 0, total: 31 });
  });
});
