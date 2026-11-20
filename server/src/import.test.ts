import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, makeApp } from './testutil.ts';

const RAPIDO = 'nome: Rápido\netapas[1]:\n  - titulo: Cama\n    objetivo: arrumar\n    atividades[1]:\n      - Trocar o lençol\n';
const imp = (c: ReturnType<typeof makeApp>, body: object, env = 'escritorio') => request(c.app).post(`/api/environments/${env}/pops/import`).send(body);
const completo = (c: ReturnType<typeof makeApp>) => join(c.popsDir, 'escritorio', 'completo.toon');

describe('importar .toon como POP do ambiente', () => {
  it('cria um POP novo no ambiente a partir do nome do arquivo', async () => {
    const c = makeApp();
    const r = await imp(c, { filename: 'rapido.toon', toon: RAPIDO });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ slug: 'rapido', name: 'Rápido', replaced: false });
    expect(readFileSync(join(c.popsDir, 'escritorio', 'rapido.toon'), 'utf8')).toBe(RAPIDO);
    const list = (await request(c.app).get('/api/environments')).body;
    expect(list.find((e: any) => e.slug === 'escritorio').pops.map((p: any) => p.name)).toEqual(['Completo', 'Rápido']);
    expect((await imp(c, { filename: 'x.toon', toon: RAPIDO }, 'nada')).status).toBe(404);
  });

  it('POP existente sem replace responde 409 e não altera nada; com replace substitui', async () => {
    const c = makeApp();
    const before = readFileSync(completo(c), 'utf8');
    const r = await imp(c, { filename: 'completo.toon', toon: RAPIDO });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ slug: 'completo', name: 'Completo' });
    expect(readFileSync(completo(c), 'utf8')).toBe(before);
    const ok = await imp(c, { filename: 'completo.toon', toon: RAPIDO, replace: true });
    expect(ok.status).toBe(200);
    expect(ok.body.replaced).toBe(true);
    expect(readFileSync(completo(c), 'utf8')).toBe(RAPIDO);
  });

  it('recusa nomes de arquivo maliciosos ou fora do padrão', async () => {
    const c = makeApp();
    for (const filename of ['../x.toon', '..\\x.toon', 'a/b.toon', 'x.txt', 'x', '.toon', 'Quarto.toon', 'x.toon.exe', 'a b.toon']) {
      const r = await imp(c, { filename, toon: RAPIDO });
      expect(r.status, filename).toBe(400);
    }
    expect((await request(c.app).get('/api/environments/escritorio')).body.pops).toHaveLength(1);
  });

  it('POP inválido não é gravado, nem pede confirmação de substituição', async () => {
    const c = makeApp();
    const bad = await imp(c, { filename: 'novo.toon', toon: 'nome: X\netapas:\n  - titulo: A\n' });
    expect(bad.status).toBe(400);
    expect(bad.body.problem.file).toBe('novo.toon');
    expect((await request(c.app).get('/api/environments/escritorio/pops/novo/pop.toon')).status).toBe(404);
    expect((await imp(c, { filename: 'completo.toon', toon: 'lixo' })).status).toBe(400);
  });

  it('substituir não apaga limpezas nem voltas', async () => {
    const c = makeApp();
    await abandoned(c, 5, [[5, 'Recolher papéis, documentos e objetos espalhados.']]);
    await imp(c, { filename: 'completo.toon', toon: RAPIDO, replace: true });
    expect((c.db.prepare('SELECT COUNT(*) AS n FROM cleanings').get() as { n: number }).n).toBe(1);
    expect((c.db.prepare('SELECT COUNT(*) AS n FROM cleaning_tasks').get() as { n: number }).n).toBe(1);
  });
});
