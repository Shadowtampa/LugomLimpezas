import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

const s = (n: number) => n * 1000;
type Ctx = ReturnType<typeof makeApp>;

const start = async (c: Ctx) => (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id as string;
const view = async (c: Ctx, id: string) => (await request(c.app).get(`/api/cleanings/${id}`)).body;
const put = async (c: Ctx, id: string, task: string, done = true) =>
  request(c.app).put(`/api/cleanings/${id}/tasks`).send({ task, done });
const texts = (v: any): string[] => v.etapas.flatMap((e: any) => e.atividades.map((a: any) => a.text));

// Deixa passar `ms` e marca todas as atividades de uma vez; devolve a resposta da última marcação.
async function finish(c: Ctx, id: string, ms: number) {
  const all = texts(await view(c, id));
  c.clock.t += ms;
  let last: any;
  for (const t of all) last = await put(c, id, t);
  return last.body;
}

describe('fim da limpeza', () => {
  it('marcar a última atividade conclui com o tempo total certo e congela o relógio', async () => {
    const c = makeApp();
    const id = await start(c);
    const v = await finish(c, id, s(100));
    expect(v.status).toBe('completed');
    expect(v.result).toMatchObject({ totalMs: s(100), newRecord: true, fastestOtherMs: null, diffMs: null });
    expect(v.endedAt).toBeTruthy();
    c.clock.t += s(60);
    expect((await view(c, id)).activeMs).toBe(s(100));
    expect((await request(c.app).post(`/api/cleanings/${id}/pause`)).status).toBe(409);
    const env = (await request(c.app).get('/api/environments/escritorio')).body;
    expect(env.inProgress).toBeNull();
    expect(env.fastestMs).toBe(s(100));
  });

  it('desmarcar numa concluída reabre pausada e marcar de novo conclui com o mesmo total', async () => {
    const c = makeApp();
    const id = await start(c);
    const done = await finish(c, id, s(100));
    const task = texts(done)[5];
    const reopened = (await put(c, id, task, false)).body;
    expect(reopened).toMatchObject({ status: 'in_progress', running: false, result: null, endedAt: null });
    expect(reopened.activeMs).toBe(s(100));
    c.clock.t += s(500); // pausada: nada corre
    expect((await view(c, id)).activeMs).toBe(s(100));
    expect((await request(c.app).get('/api/environments/escritorio')).body.fastestMs).toBeNull();
    expect((await put(c, id, task)).body).toMatchObject({ status: 'completed', result: { totalMs: s(100) } });
  });

  it('a mais rápida é o menor total entre as concluídas, e o resultado compara com as outras', async () => {
    const c = makeApp();
    const a = await start(c);
    expect((await finish(c, a, s(100))).result.newRecord).toBe(true);
    const b = await start(c);
    expect((await finish(c, b, s(80))).result).toMatchObject({ newRecord: true, diffMs: -s(20), fastestOtherMs: s(100) });
    const third = await start(c);
    const r = (await finish(c, third, s(130))).result;
    expect(r).toMatchObject({ newRecord: false, diffMs: s(50), fastestOtherMs: s(80) });
    expect((await request(c.app).get('/api/environments/escritorio')).body.fastestMs).toBe(s(80));
  });

  it('lista as atividades em que o recorde foi batido', async () => {
    const c = makeApp();
    const a = await start(c);
    await finish(c, a, s(310)); // volta da primeira atividade: 310s; as demais: 0
    const b = await start(c);
    const all = texts(await view(c, b));
    c.clock.t += s(10);
    let last: any;
    for (const t of all) last = (await put(c, b, t)).body;
    expect(last.result.brokenRecords).toEqual([{ text: all[0], lapMs: s(10), recordMs: s(310) }]);
  });
});
