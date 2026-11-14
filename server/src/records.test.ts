import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';
const s = (n: number) => n * 1000;

type Ctx = ReturnType<typeof makeApp>;
const start = async (c: Ctx, env = 'escritorio') => (await request(c.app).post(`/api/environments/${env}/cleanings`)).body.id as string;
const mark = async (c: Ctx, id: string, task: string, done = true) =>
  (await request(c.app).put(`/api/cleanings/${id}/tasks`).send({ task, done })).body;
const find = (v: any, task: string) => v.etapas.flatMap((e: any) => e.atividades).find((a: any) => a.text === task);

describe('recordes', () => {
  it('é a menor volta de OUTRAS limpezas (qualquer status) e a diferença sai da comparação', async () => {
    const c = makeApp();
    const first = await start(c);
    c.clock.t += s(30);
    const v1 = await mark(c, first, A);
    expect(find(v1, A).recordMs).toBeUndefined(); // a limpeza atual não conta
    expect(find(v1, A).deltaMs).toBeUndefined();

    c.db.prepare("UPDATE cleanings SET status = 'abandoned' WHERE id = ?").run(first);
    const second = await start(c);
    expect(find((await request(c.app).get(`/api/cleanings/${second}`)).body, A).recordMs).toBe(s(30));

    c.clock.t += s(20);
    const v2 = await mark(c, second, A);
    expect(find(v2, A)).toMatchObject({ lapMs: s(20), recordMs: s(30), deltaMs: -s(10) });

    // uma terceira volta mais lenta não muda o recorde; a mais rápida entre as outras vale
    c.db.prepare("UPDATE cleanings SET status = 'abandoned' WHERE id = ?").run(second);
    const third = await start(c);
    c.clock.t += s(50);
    expect(find(await mark(c, third, A), A)).toMatchObject({ recordMs: s(20), deltaMs: s(30) });
  });

  it('o recorde é por ambiente', async () => {
    const c = makeApp();
    const first = await start(c);
    c.clock.t += s(10);
    await mark(c, first, A);
    const other = await start(c, 'banheiro-escritorio');
    const v = (await request(c.app).get(`/api/cleanings/${other}`)).body;
    expect(v.etapas.flatMap((e: any) => e.atividades).every((a: any) => a.recordMs === undefined)).toBe(true);
  });

  it('mudar o texto da atividade no POP cria uma atividade nova, sem recorde', async () => {
    const c = makeApp();
    const first = await start(c);
    c.clock.t += s(30);
    await mark(c, first, A);
    c.db.prepare("UPDATE cleanings SET status = 'abandoned' WHERE id = ?").run(first);

    const file = join(c.popsDir, 'escritorio.toon');
    const edited = 'Retirar copos e pratos.';
    writeFileSync(file, readFileSync(file, 'utf8').replace(A, edited));
    const second = await start(c);
    const v = (await request(c.app).get(`/api/cleanings/${second}`)).body;
    expect(find(v, edited).recordMs).toBeUndefined();
    expect(find(v, A)).toBeUndefined();
  });
});
