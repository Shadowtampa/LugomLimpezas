import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, makeApp } from './testutil.ts';

const s = (n: number) => n * 1000;

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';

const find = (v: any, task: string) => v.etapas.flatMap((e: any) => e.atividades).find((a: any) => a.text === task);
const records = async (c: ReturnType<typeof makeApp>, slug = 'escritorio') => (await request(c.app).get(`/api/environments/${slug}/pops/completo/records`)).body;

describe('recordes', () => {
  it('é a menor volta de OUTRAS limpezas (qualquer status) e a diferença sai da comparação', async () => {
    const c = makeApp();
    const first = (await abandoned(c, 40, [[30, A]])).body;
    expect(find(first, A).recordMs).toBeUndefined(); // a limpeza atual não conta
    expect(find(first, A).deltaMs).toBeUndefined();
    expect(await records(c)).toEqual({ [A]: s(30) });

    const second = (await abandoned(c, 40, [[20, A]])).body;
    expect(find(second, A)).toMatchObject({ lapMs: s(20), recordMs: s(30), deltaMs: -s(10) });

    // uma terceira volta mais lenta não muda o recorde; a mais rápida entre as outras vale
    const third = (await abandoned(c, 60, [[50, A]])).body;
    expect(find(third, A)).toMatchObject({ recordMs: s(20), deltaMs: s(30) });
  });

  it('o recorde é por ambiente', async () => {
    const c = makeApp();
    await abandoned(c, 10, [[10, A]]);
    expect(await records(c, 'banheiro-escritorio')).toEqual({});
  });

  it('mudar o texto da atividade no POP cria uma atividade nova, sem recorde', async () => {
    const c = makeApp();
    await abandoned(c, 30, [[30, A]]);
    const file = join(c.popsDir, 'escritorio', 'completo.toon');
    writeFileSync(file, readFileSync(file, 'utf8').replace(A, 'Retirar copos e pratos.'));
    expect((await records(c))['Retirar copos e pratos.']).toBeUndefined();
  });
});
