import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { abandoned, makeApp } from './testutil.ts';

const QUARTO = 'ambiente: Quarto\netapas[1]:\n  - titulo: Cama\n    objetivo: arrumar\n    atividades[1]:\n      - Trocar o lençol\n';
const imp = (c: ReturnType<typeof makeApp>, body: object) => request(c.app).post('/api/environments/import').send(body);

describe('importar .toon', () => {
  it('cria um ambiente novo a partir do nome do arquivo', async () => {
    const c = makeApp();
    const r = await imp(c, { filename: 'quarto.toon', toon: QUARTO });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ slug: 'quarto', name: 'Quarto', replaced: false });
    expect(readFileSync(join(c.popsDir, 'quarto.toon'), 'utf8')).toBe(QUARTO);
    const list = (await request(c.app).get('/api/environments')).body;
    expect(list.find((e: any) => e.slug === 'quarto').name).toBe('Quarto');
  });

  it('ambiente existente sem replace responde 409 e não altera nada; com replace substitui', async () => {
    const c = makeApp();
    const before = readFileSync(join(c.popsDir, 'escritorio.toon'), 'utf8');
    const r = await imp(c, { filename: 'escritorio.toon', toon: QUARTO });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ slug: 'escritorio', name: 'Escritório' });
    expect(readFileSync(join(c.popsDir, 'escritorio.toon'), 'utf8')).toBe(before);
    const ok = await imp(c, { filename: 'escritorio.toon', toon: QUARTO, replace: true });
    expect(ok.status).toBe(200);
    expect(ok.body.replaced).toBe(true);
    expect(readFileSync(join(c.popsDir, 'escritorio.toon'), 'utf8')).toBe(QUARTO);
  });

  it('recusa nomes de arquivo maliciosos ou fora do padrão', async () => {
    const c = makeApp();
    for (const filename of ['../x.toon', '..\\x.toon', 'a/b.toon', 'x.txt', 'x', '.toon', 'Quarto.toon', 'x.toon.exe', 'a b.toon']) {
      const r = await imp(c, { filename, toon: QUARTO });
      expect(r.status, filename).toBe(400);
    }
    expect((await request(c.app).get('/api/environments')).body).toHaveLength(2);
  });

  it('POP inválido não é gravado, nem pede confirmação de substituição', async () => {
    const c = makeApp();
    const bad = await imp(c, { filename: 'novo.toon', toon: 'ambiente: X\netapas:\n  - titulo: A\n' });
    expect(bad.status).toBe(400);
    expect(bad.body.problem.file).toBe('novo.toon');
    expect((await request(c.app).get('/api/environments/novo/pop.toon')).status).toBe(404);
    const onExisting = await imp(c, { filename: 'escritorio.toon', toon: 'lixo' });
    expect(onExisting.status).toBe(400);
  });

  it('substituir não apaga limpezas nem voltas', async () => {
    const c = makeApp();
    await abandoned(c, 5, [[5, 'Recolher papéis, documentos e objetos espalhados.']]);
    await imp(c, { filename: 'escritorio.toon', toon: QUARTO, replace: true });
    expect((c.db.prepare('SELECT COUNT(*) AS n FROM cleanings').get() as { n: number }).n).toBe(1);
    expect((c.db.prepare('SELECT COUNT(*) AS n FROM cleaning_tasks').get() as { n: number }).n).toBe(1);
  });
});
