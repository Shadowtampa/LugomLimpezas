import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';
const B = 'Recolher papéis, documentos e objetos espalhados.';
const s = (n: number) => n * 1000;

async function setup() {
  const ctx = makeApp();
  const { id } = (await request(ctx.app).post('/api/environments/escritorio/cleanings')).body;
  const get = async () => (await request(ctx.app).get(`/api/cleanings/${id}`)).body;
  const mark = async (task: string, done = true) => (await request(ctx.app).put(`/api/cleanings/${id}/tasks`).send({ task, done })).body;
  const post = async (p: string) => (await request(ctx.app).post(`/api/cleanings/${id}/${p}`)).body;
  const lap = (v: any, task: string) => v.etapas.flatMap((e: any) => e.atividades).find((a: any) => a.text === task).lapMs;
  return { ...ctx, id, get, mark, post, lap };
}

describe('cronômetro e voltas', () => {
  it('o tempo corre desde o início e sobrevive a recarregar', async () => {
    const t = await setup();
    expect((await t.get()).activeMs).toBe(0);
    t.clock.t += s(30);
    const v = await t.get();
    expect(v.activeMs).toBe(s(30));
    expect(v.running).toBe(true);
  });

  it('a volta desconta o tempo em pausa', async () => {
    const t = await setup();
    t.clock.t += s(10);
    expect((await t.post('pause')).running).toBe(false);
    t.clock.t += s(100); // pausado: não conta
    expect((await t.get()).activeMs).toBe(s(10));
    expect((await t.post('resume')).running).toBe(true);
    t.clock.t += s(5);
    const v = await t.mark(A);
    expect(t.lap(v, A)).toBe(s(15));
    expect(v.activeMs).toBe(s(15));
  });

  it('pausar e retomar repetidos não mudam nada', async () => {
    const t = await setup();
    t.clock.t += s(10);
    await t.post('pause');
    t.clock.t += s(50);
    await t.post('pause');
    expect((await t.get()).activeMs).toBe(s(10));
    await t.post('resume');
    t.clock.t += s(5);
    await t.post('resume');
    expect((await t.get()).activeMs).toBe(s(15));
  });

  it('a volta conta desde a marcação mais recente, inclusive fora de ordem', async () => {
    const t = await setup();
    t.clock.t += s(20);
    expect(t.lap(await t.mark(B), B)).toBe(s(20));
    t.clock.t += s(10);
    expect(t.lap(await t.mark(A), A)).toBe(s(10));
  });

  it('desmarcar apaga a volta, e a próxima marcação conta desde a anterior ainda marcada', async () => {
    const t = await setup();
    t.clock.t += s(20);
    await t.mark(A);
    t.clock.t += s(10);
    const unmarked = await t.mark(A, false);
    expect(t.lap(unmarked, A)).toBeUndefined();
    t.clock.t += s(5);
    expect(t.lap(await t.mark(B), B)).toBe(s(35));
  });

  it('marcar de novo uma atividade marcada não muda a volta', async () => {
    const t = await setup();
    t.clock.t += s(20);
    await t.mark(A);
    t.clock.t += s(10);
    expect(t.lap(await t.mark(A), A)).toBe(s(20));
  });
});
