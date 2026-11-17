import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, makeApp } from './testutil.ts';

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';
const GOOD = 'ambiente: Escritório\r\netapas[1]:\r\n  - titulo: Única  \r\n    objetivo: o\r\n    atividades[2]:\r\n      - Nova atividade\r\n      - Outra\r\n';

describe('editar e exportar o POP', () => {
  it('salva exatamente o texto digitado e exporta o arquivo como foi gravado', async () => {
    const c = makeApp();
    const put = await request(c.app).put('/api/environments/escritorio/pop').send({ toon: GOOD });
    expect(put.status).toBe(200);
    expect(readFileSync(join(c.popsDir, 'escritorio.toon'), 'utf8')).toBe(GOOD);
    const get = await request(c.app).get('/api/environments/escritorio/pop.toon');
    expect(get.status).toBe(200);
    expect(get.text).toBe(GOOD);
    expect(get.headers['content-disposition']).toContain('escritorio.toon');
    expect(readdirSync(c.popsDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('POP inválido devolve 400 com o problema e não altera o arquivo', async () => {
    const c = makeApp();
    const file = join(c.popsDir, 'escritorio.toon');
    const before = readFileSync(file, 'utf8');
    const r = await request(c.app).put('/api/environments/escritorio/pop').send({ toon: 'ambiente: X\netapas:\n  - titulo: A\n' });
    expect(r.status).toBe(400);
    expect(r.body.problem.file).toBe('escritorio.toon');
    expect(readFileSync(file, 'utf8')).toBe(before);
    const dup = await request(c.app).put('/api/environments/escritorio/pop')
      .send({ toon: 'ambiente: X\netapas[1]:\n  - titulo: A\n    objetivo: o\n    atividades[2]:\n      - a\n      - a\n' });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/repetida/);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('recusa arquivo acima de 100 KB', async () => {
    const c = makeApp();
    const before = readFileSync(join(c.popsDir, 'escritorio.toon'), 'utf8');
    const big = GOOD + '# ' + 'x'.repeat(100 * 1024);
    const r = await request(c.app).put('/api/environments/escritorio/pop').send({ toon: big });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/100 KB/);
    expect(readFileSync(join(c.popsDir, 'escritorio.toon'), 'utf8')).toBe(before);
  });

  it('exporta e edita mesmo um arquivo inválido; ambiente inexistente é 404', async () => {
    const c = makeApp();
    writeFileSync(join(c.popsDir, 'quebrado.toon'), 'lixo: [');
    expect((await request(c.app).get('/api/environments/quebrado/pop.toon')).text).toBe('lixo: [');
    expect((await request(c.app).put('/api/environments/quebrado/pop').send({ toon: GOOD })).status).toBe(200);
    expect((await request(c.app).get('/api/environments/nada/pop.toon')).status).toBe(404);
    expect((await request(c.app).put('/api/environments/nada/pop').send({ toon: GOOD })).status).toBe(404);
    expect((await request(c.app).get('/api/environments/..%2F..%2Fx/pop.toon')).status).toBe(404);
  });

  it('editar o POP depois de uma limpeza: atividades novas aparecem e voltas de removidas continuam no banco', async () => {
    const c = makeApp();
    const id = (await abandoned(c, 5, [[5, A]])).body.id;
    await request(c.app).put('/api/environments/escritorio/pop').send({ toon: GOOD });
    const v = (await request(c.app).get(`/api/cleanings/${id}`)).body;
    expect(v.etapas.flatMap((e: any) => e.atividades.map((a: any) => a.text))).toEqual(['Nova atividade', 'Outra']);
    expect(v.progress).toEqual({ done: 0, total: 2 });
    const rows = c.db.prepare('SELECT COUNT(*) AS n FROM cleaning_tasks WHERE cleaning_id = ? AND task = ?').get(id, A) as { n: number };
    expect(rows.n).toBe(1);
  });
});
