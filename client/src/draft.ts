import type { CleaningView, PopView } from './api.ts';
import { previewView } from './progress.ts';

// Rascunho da limpeza em andamento: só uma lista de eventos com horário, guardada no localStorage.
// Vai ao servidor num único envio ao finalizar ou abandonar; lá os tempos são recalculados (mesma regra de replay).
export type Evento = { tipo: 'inicio' | 'feito' | 'desmarcar' | 'pausa' | 'retomada' | 'abandono'; atividade?: string; em: string };
// `pop` falta nos rascunhos abertos antes de existir mais de um POP: vale o "completo".
export type Draft = { id: string; ambiente: string; pop?: string; eventos: Evento[] };
export const draftPop = (d: Draft) => d.pop ?? 'completo';

const key = (slug: string) => `limpeza:${slug}`;

// shortcut: sem localStorage (modo privado, cota) a limpeza segue na tela, mas não sobrevive a recarregar.
export function saveDraft(d: Draft) {
  try { localStorage.setItem(key(d.ambiente), JSON.stringify(d)); } catch { /* ver acima */ }
}
export function clearDraft(slug: string) {
  try { localStorage.removeItem(key(slug)); } catch { /* ver acima */ }
}
export function loadDraft(slug: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(key(slug)) ?? 'null') as Draft | null;
    return d && d.ambiente === slug && Array.isArray(d.eventos) && d.eventos.length > 0 ? d : null;
  } catch { return null; }
}
export function allDrafts(): Draft[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith('limpeza:')).flatMap((k) => loadDraft(k.slice(8)) ?? []);
  } catch { return []; }
}
export const findDraft = (id: string) => allDrafts().find((d) => d.id === id) ?? null;

// UUID v4 sem crypto.randomUUID, que só existe em contexto seguro (o servidor é http pelo Tailscale).
export function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const startDraft = (ambiente: string, pop: string, at = Date.now()): Draft => ({ id: newId(), ambiente, pop, eventos: [{ tipo: 'inicio', em: new Date(at).toISOString() }] });

// O horário nunca anda para trás (relógio do aparelho ajustado): o servidor recusa eventos fora de ordem.
export function addEvent(d: Draft, tipo: Evento['tipo'], atividade?: string, at = Date.now()): Draft {
  const last = Date.parse(d.eventos[d.eventos.length - 1].em);
  return { ...d, eventos: [...d.eventos, { tipo, atividade, em: new Date(Math.max(at, last)).toISOString() }] };
}

// R4/R5: tempo ativo (sem pausas) e volta de cada atividade marcada; `at` é o "agora" do cronômetro.
export function replay(d: Draft, at: number) {
  let active = 0;
  let since: number | null = null;
  const laps = new Map<string, { markedMs: number; lapMs: number }>();
  for (const e of d.eventos) {
    const t = Date.parse(e.em);
    const now = active + (since === null ? 0 : t - since);
    if (e.tipo === 'inicio' || e.tipo === 'retomada') since ??= t;
    else if (e.tipo === 'pausa' || e.tipo === 'abandono') { active = now; since = null; }
    else if (e.tipo === 'feito' && !laps.has(e.atividade!)) {
      const last = Math.max(0, ...[...laps.values()].map((l) => l.markedMs));
      laps.set(e.atividade!, { markedMs: now, lapMs: now - last });
    } else if (e.tipo === 'desmarcar') laps.delete(e.atividade!);
  }
  return { activeMs: active + (since === null ? 0 : at - since), running: since !== null, laps };
}

export const draftDone = (d: Draft) => replay(d, 0).laps.size;

// A mesma tela do servidor, montada a partir do POP, dos recordes (lidos uma vez) e do rascunho.
export function draftView(pop: PopView, records: Record<string, number>, d: Draft, at: number): CleaningView {
  const base = previewView(pop);
  const r = replay(d, at);
  const etapas = base.etapas.map((e) => ({
    ...e,
    atividades: e.atividades.map((a) => {
      const lap = r.laps.get(a.text);
      const recordMs = records[a.text];
      return { ...a, done: !!lap, lapMs: lap?.lapMs, recordMs, deltaMs: lap && recordMs !== undefined ? lap.lapMs - recordMs : undefined };
    }),
  }));
  const done = etapas.flatMap((e) => e.atividades).filter((a) => a.done).length;
  return { ...base, id: d.id, environment: d.ambiente, pop: draftPop(d), startedAt: d.eventos[0].em, activeMs: r.activeMs, running: r.running, etapas, progress: { done, total: base.progress.total } };
}

// O que falta enviar: abandono pedido, ou tudo marcado (R7). null = a limpeza segue em andamento.
export function pendingStatus(d: Draft, v: CleaningView): 'abandonada' | 'concluida' | null {
  if (d.eventos[d.eventos.length - 1].tipo === 'abandono') return 'abandonada';
  return v.progress.done === v.progress.total ? 'concluida' : null;
}
