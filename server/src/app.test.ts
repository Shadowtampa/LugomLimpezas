import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { parsePop } from './pops.ts';

const seeds = resolve(import.meta.dirname, '../../pops');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pops-')); });

describe('GET /api/environments', () => {
  it('lista os ambientes iniciais', async () => {
    copyFileSync(join(seeds, 'escritorio.toon'), join(dir, 'escritorio.toon'));
    copyFileSync(join(seeds, 'banheiro-escritorio.toon'), join(dir, 'banheiro-escritorio.toon'));
    const r = await request(createApp({ popsDir: dir, db: openDb(':memory:') })).get('/api/environments');
    expect(r.body).toEqual([
      { slug: 'banheiro-escritorio', name: 'Banheiro do escritório' },
      { slug: 'escritorio', name: 'Escritório' },
    ]);
  });

  it('arquivo inválido só quebra o próprio ambiente e vê edição sem reiniciar', async () => {
    copyFileSync(join(seeds, 'escritorio.toon'), join(dir, 'escritorio.toon'));
    writeFileSync(join(dir, 'ruim.toon'), 'ambiente: Ruim\netapas:\n  - titulo: A\n');
    const app = createApp({ popsDir: dir, db: openDb(':memory:') });
    const r = await request(app).get('/api/environments');
    expect(r.body.find((e: any) => e.slug === 'escritorio').name).toBe('Escritório');
    const ruim = r.body.find((e: any) => e.slug === 'ruim');
    expect(ruim.name).toBeUndefined();
    expect(ruim.error.file).toBe('ruim.toon');
    expect(ruim.error.message).toBeTruthy();

    writeFileSync(join(dir, 'ruim.toon'), 'ambiente: Consertado\netapas[1]:\n  - titulo: A\n    objetivo: o\n    atividades[1]:\n      - x\n');
    const r2 = await request(app).get('/api/environments');
    expect(r2.body.find((e: any) => e.slug === 'ruim').name).toBe('Consertado');
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
