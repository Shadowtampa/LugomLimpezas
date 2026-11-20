import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

const toon = 'ambiente: Sala\netapas[1]:\n  - titulo: A\n    objetivo: b.\n    aviso: Cuidado.\n    atividades[2]:\n      - Fazer.\n      - texto: Refazer.\n        descricao: Com calma.\n';

describe('pré-visualização do POP', () => {
  it('devolve o POP salvo sem criar limpeza nem mexer no arquivo', async () => {
    const c = makeApp();
    const before = readFileSync(join(c.popsDir, 'escritorio', 'completo.toon'), 'utf8');
    const r = await request(c.app).get('/api/environments/escritorio/pops/completo');
    expect(r.status).toBe(200);
    expect(r.body.ambiente).toBe('Escritório');
    expect(r.body.etapas[0].atividades[0].texto).toBeTruthy();
    expect(c.db.prepare('SELECT COUNT(*) AS n FROM cleanings').get()).toEqual({ n: 0 });
    expect(readFileSync(join(c.popsDir, 'escritorio', 'completo.toon'), 'utf8')).toBe(before);
    expect((await request(c.app).get('/api/environments/nao-existe/pops/completo')).status).toBe(404);
  });

  it('pré-visualiza um texto ainda não salvo (também dentro de cerca) e nada é gravado', async () => {
    const c = makeApp();
    for (const text of [toon, '```toon\n' + toon + '```']) {
      const r = await request(c.app).post('/api/pop-preview').send({ toon: text });
      expect(r.status).toBe(200);
      expect(r.body.etapas[0].atividades).toEqual([{ texto: 'Fazer.' }, { texto: 'Refazer.', descricao: 'Com calma.' }]);
    }
    expect(readFileSync(join(c.popsDir, 'escritorio', 'completo.toon'), 'utf8')).not.toContain('Sala');
  });

  it('texto inválido devolve 400 com o problema', async () => {
    const c = makeApp();
    const r = await request(c.app).post('/api/pop-preview').send({ toon: 'ambiente: X\netapas: nada' });
    expect(r.status).toBe(400);
    expect(r.body.problem.message).toBeTruthy();
    expect((await request(c.app).post('/api/pop-preview').send({})).status).toBe(400);
  });
});
