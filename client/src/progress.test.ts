import { describe, expect, it } from 'vitest';
import type { Etapa } from './api.ts';
import { currentAndNext, currentEtapaIndex } from './progress.ts';

const etapas = (marks: boolean[][]): Etapa[] =>
  marks.map((m, i) => ({ titulo: `E${i}`, objetivo: 'o', atividades: m.map((done, j) => ({ text: `${i}.${j}`, done })) }));

describe('atividade atual e próxima', () => {
  it('começa na primeira', () => {
    expect(currentAndNext(etapas([[false, false], [false]]))).toEqual({ current: '0.0', next: '0.1' });
  });
  it('pula as marcadas, inclusive fora de ordem', () => {
    expect(currentAndNext(etapas([[false, true], [false, false]]))).toEqual({ current: '0.0', next: '1.0' });
    expect(currentAndNext(etapas([[true, true], [false, false]]))).toEqual({ current: '1.0', next: '1.1' });
  });
  it('sem próxima na última e sem atual quando tudo está marcado', () => {
    expect(currentAndNext(etapas([[true], [false]]))).toEqual({ current: '1.0', next: null });
    expect(currentAndNext(etapas([[true], [true]]))).toEqual({ current: null, next: null });
  });
  it('etapa atual acompanha a atividade atual', () => {
    expect(currentEtapaIndex(etapas([[true], [false]]))).toBe(1);
    expect(currentEtapaIndex(etapas([[true], [true]]))).toBe(1);
  });
});
