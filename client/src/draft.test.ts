import { describe, expect, it } from 'vitest';
import type { PopView } from './api.ts';
import { addEvent, draftDone, draftView, newId, pendingStatus, replay, startDraft } from './draft.ts';

const T0 = Date.parse('2026-01-01T12:00:00Z');
const s = (n: number) => n * 1000;
const pop: PopView = { ambiente: 'Sala', etapas: [{ titulo: 'E', objetivo: 'o', atividades: [{ texto: 'A' }, { texto: 'B' }] }] };

// Rascunho montado segundo a segundo, como o usuário usaria.
function run(steps: [number, Parameters<typeof addEvent>[1], string?][]) {
  let d = startDraft('sala', T0);
  for (const [sec, tipo, task] of steps) d = addEvent(d, tipo, task, T0 + s(sec));
  return d;
}

describe('replay do rascunho', () => {
  it('o tempo corre desde o início e a volta desconta a pausa', () => {
    const d = run([[10, 'pausa'], [110, 'retomada'], [115, 'feito', 'A']]);
    const r = replay(d, T0 + s(120));
    expect(r.laps.get('A')!.lapMs).toBe(s(15));
    expect(r).toMatchObject({ activeMs: s(20), running: true });
    expect(replay(run([[10, 'pausa']]), T0 + s(999))).toMatchObject({ activeMs: s(10), running: false });
  });

  it('a volta conta desde a marcação mais recente ainda marcada; desmarcar apaga a volta', () => {
    const d = run([[20, 'feito', 'B'], [30, 'feito', 'A'], [40, 'desmarcar', 'A'], [50, 'feito', 'A'], [50, 'feito', 'A']]);
    const { laps } = replay(d, T0 + s(60));
    expect(laps.get('B')!.lapMs).toBe(s(20));
    expect(laps.get('A')!.lapMs).toBe(s(30)); // desde B (20s), marcada em 50s
    expect(draftDone(d)).toBe(2);
  });

  it('abandono congela o relógio', () => {
    expect(replay(run([[25, 'abandono']]), T0 + s(500))).toMatchObject({ activeMs: s(25), running: false });
  });
});

describe('tela e pendências', () => {
  it('monta a tela com done, volta e recorde', () => {
    const v = draftView(pop, { A: s(30) }, run([[20, 'feito', 'A']]), T0 + s(20));
    expect(v.etapas[0].atividades[0]).toMatchObject({ text: 'A', done: true, lapMs: s(20), recordMs: s(30), deltaMs: -s(10) });
    expect(v.etapas[0].atividades[1]).toMatchObject({ text: 'B', done: false, recordMs: undefined });
    expect(v).toMatchObject({ environmentName: 'Sala', environment: 'sala', status: 'in_progress', progress: { done: 1, total: 2 } });
  });

  it('pendente: tudo marcado vira concluída; abandono vira abandonada; senão segue em andamento', () => {
    const view = (d: ReturnType<typeof run>) => draftView(pop, {}, d, T0 + s(99));
    const open = run([[5, 'feito', 'A']]);
    expect(pendingStatus(open, view(open))).toBeNull();
    const full = run([[5, 'feito', 'A'], [6, 'feito', 'B']]);
    expect(pendingStatus(full, view(full))).toBe('concluida');
    const abandon = run([[5, 'feito', 'A'], [6, 'abandono']]);
    expect(pendingStatus(abandon, view(abandon))).toBe('abandonada');
  });
});

describe('eventos', () => {
  it('o horário nunca anda para trás', () => {
    const d = addEvent(startDraft('sala', T0 + s(100)), 'pausa', undefined, T0);
    expect(d.eventos[1].em).toBe(d.eventos[0].em);
  });

  it('o id é um uuid v4 sem depender de crypto.randomUUID', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(newId());
  });
});
