import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parsePop } from './pops.ts';
import { makeApp } from './testutil.ts';

describe('GET /api/environments', () => {
  it('lista os ambientes iniciais, cada um com seus POPs', async () => {
    const r = await request(makeApp().app).get('/api/environments');
    expect(r.body).toEqual([
      { slug: 'banheiro-escritorio', name: 'Banheiro do escritório', pops: [{ slug: 'completo', name: 'Completo' }] },
      { slug: 'escritorio', name: 'Escritório', pops: [{ slug: 'completo', name: 'Completo' }] },
    ]);
  });

  it('POP inválido só quebra o próprio POP e vê edição sem reiniciar', async () => {
    const c = makeApp();
    writeFileSync(join(c.popsDir, 'escritorio', 'ruim.toon'), 'nome: Ruim\netapas:\n  - titulo: A\n');
    const pops = async () => (await request(c.app).get('/api/environments')).body.find((e: any) => e.slug === 'escritorio').pops;
    const [completo, ruim] = await pops();
    expect(completo.name).toBe('Completo');
    expect(ruim.name).toBeUndefined();
    expect(ruim.error.file).toBe('escritorio/ruim.toon');
    expect(ruim.error.message).toBeTruthy();

    writeFileSync(join(c.popsDir, 'escritorio', 'ruim.toon'), 'nome: Consertado\netapas[1]:\n  - titulo: A\n    objetivo: o\n    atividades[1]:\n      - x\n');
    expect((await pops())[1].name).toBe('Consertado');
  });
});

describe('parsePop', () => {
  const base = (atv: string) => `ambiente: A\netapas[1]:\n  - titulo: T\n    objetivo: o\n    atividades[9]:\n${atv}`;
  it('ignora contadores [N] errados', () => {
    expect(parsePop(base('      - a\n      - b\n'), 'a.toon').etapas[0].atividades.map((x) => x.texto)).toEqual(['a', 'b']);
  });
  it('recusa atividade repetida', () => {
    expect(() => parsePop(base('      - a\n      - a\n'), 'a.toon')).toThrow(/repetida/);
  });
  it('recusa arquivo acima de 100 KB', () => {
    expect(() => parsePop('x'.repeat(100 * 1024 + 1), 'a.toon')).toThrow(/100 KB/);
  });
});
