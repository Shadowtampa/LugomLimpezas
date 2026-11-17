import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, ev, finish, makeApp, submit, tasksOf } from './testutil.ts';

const s = (n: number) => n * 1000;


describe('fim da limpeza', () => {
  it('a mais rápida é o menor total entre as concluídas, e o resultado compara com as outras', async () => {
    const c = makeApp();
    expect((await finish(c, 100)).body.result.newRecord).toBe(true);
    expect((await finish(c, 80)).body.result).toMatchObject({ newRecord: true, diffMs: -s(20), fastestOtherMs: s(100) });
    expect((await finish(c, 130)).body.result).toMatchObject({ newRecord: false, diffMs: s(50), fastestOtherMs: s(80) });
    expect((await request(c.app).get('/api/environments/escritorio')).body.fastestMs).toBe(s(80));
  });

  it('abandonada não conta como a mais rápida', async () => {
    const c = makeApp();
    await abandoned(c, 5);
    expect((await request(c.app).get('/api/environments/escritorio')).body.fastestMs).toBeNull();
  });

  it('lista as atividades em que o recorde foi batido', async () => {
    const c = makeApp();
    await finish(c, 310); // volta da primeira atividade: 310s; as demais: 0
    const tasks = await tasksOf(c);
    const r = await submit(c, [ev(0, 'inicio'), ...tasks.map((t) => ev(10, 'feito', t))]);
    expect(r.body.result.brokenRecords).toEqual([{ text: tasks[0], lapMs: s(10), recordMs: s(310) }]);
  });
});
