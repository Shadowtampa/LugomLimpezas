import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, finish, makeApp } from './testutil.ts';

const s = (n: number) => n * 1000;

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';

describe('histórico do ambiente', () => {
  it('lista da mais recente para a mais antiga, com status, tempo e progresso', async () => {
    const c = makeApp();
    const hist = async () => (await request(c.app).get('/api/environments/escritorio')).body.history;
    expect(await hist()).toEqual([]);
    const first = (await abandoned(c, 40, [[30, A]])).body.id;
    const second = (await finish(c, 7)).body.id;
    const h = await hist();
    expect(h.map((x: any) => x.id)).toEqual([second, first]);
    expect(h[0]).toMatchObject({ status: 'completed', totalMs: s(7), done: 31, total: 31 });
    expect(h[1]).toMatchObject({ status: 'abandoned', totalMs: s(40), done: 1, total: 31 });
  });

  it('o progresso usa o POP atual (texto editado ou removido não conta)', async () => {
    const c = makeApp();
    await abandoned(c, 5, [[5, A]]);
    const file = join(c.popsDir, 'escritorio.toon');
    writeFileSync(file, readFileSync(file, 'utf8').replace(A, 'Texto novo da atividade.'));
    const h = (await request(c.app).get('/api/environments/escritorio')).body.history;
    expect(h[0]).toMatchObject({ done: 0, total: 31 });
  });
});
