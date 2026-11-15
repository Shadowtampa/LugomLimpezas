import { describe, expect, it } from 'vitest';
import type { Etapa } from './api.ts';
import { currentAndNext, currentEtapaIndex, previewView, togglePreview } from './progress.ts';

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

describe('pré-visualização', () => {
  const pop = { ambiente: 'Sala', etapas: [{ titulo: 'A', objetivo: 'o', atividades: [{ texto: 'x' }, { texto: 'y', descricao: 'd' }] }] };
  it('começa sem nada marcado e sem cronômetro, e marcar/desmarcar só muda o estado local', () => {
    const v = previewView(pop);
    expect(v).toMatchObject({ running: false, activeMs: 0, result: null, progress: { done: 0, total: 2 } });
    expect(currentAndNext(v.etapas)).toEqual({ current: 'x', next: 'y' });
    const m = togglePreview(v, 'x', true);
    expect(m.progress.done).toBe(1);
    expect(currentAndNext(m.etapas).current).toBe('y');
    expect(v.progress.done).toBe(0);
    expect(togglePreview(m, 'x', false).progress.done).toBe(0);
  });
});
