import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parsePop } from './pops.ts';
import { abandoned, makeApp } from './testutil.ts';

const head = 'ambiente: A\netapas[1]:\n  - titulo: T\n    objetivo: o\n    atividades[9]:\n';
const pop = (items: string) => parsePop(head + items, 'a.toon').etapas[0].atividades;
const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';

describe('descrição da atividade', () => {
  it('aceita texto simples e objeto com descrição na mesma lista', () => {
    const r = pop('      - Simples\n      - texto: Com descrição\n        descricao: Use pano de microfibra.\n      - texto: Objeto sem descrição\n');
    expect(r).toEqual([
      { texto: 'Simples', descricao: undefined },
      { texto: 'Com descrição', descricao: 'Use pano de microfibra.' },
      { texto: 'Objeto sem descrição' },
    ]);
  });

  it('recusa texto repetido (com ou sem descrição) e objeto sem texto', () => {
    expect(() => pop('      - X\n      - texto: X\n        descricao: d\n')).toThrow(/repetida/);
    expect(() => pop('      - descricao: só descrição\n')).toThrow();
  });

  it('a descrição chega na visualização da limpeza', async () => {
    const c = makeApp();
    const file = join(c.popsDir, 'escritorio.toon');
    writeFileSync(file, readFileSync(file, 'utf8').replace(`      - ${A}`, `      - texto: ${A}\n        descricao: Leve uma bandeja.`));
    const v = (await abandoned(c, 5)).body;
    expect(v.etapas[0].atividades[0]).toMatchObject({ text: A, descricao: 'Leve uma bandeja.' });
    expect(v.etapas[0].atividades[1].descricao).toBeUndefined();
  });

  it('editar só a descrição não zera o recorde (a identidade é o texto)', async () => {
    const c = makeApp();
    await abandoned(c, 30, [[30, A]]);
    await request(c.app).put('/api/environments/escritorio/pop').send({
      toon: readFileSync(join(c.popsDir, 'escritorio.toon'), 'utf8').replace(`      - ${A}`, `      - texto: ${A}\n        descricao: Nova descrição.`),
    });
    const v = (await abandoned(c, 40, [[40, A]])).body;
    expect(v.etapas[0].atividades[0]).toMatchObject({ descricao: 'Nova descrição.', recordMs: 30_000 });
  });
});
