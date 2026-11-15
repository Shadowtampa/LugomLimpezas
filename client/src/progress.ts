import type { CleaningView, Etapa, PopView } from './api.ts';

// R2: a atual é a primeira atividade não marcada na ordem do POP; a próxima é a seguinte não marcada.
export function currentAndNext(etapas: Etapa[]) {
  const open = etapas.flatMap((e) => e.atividades).filter((a) => !a.done);
  return { current: open[0]?.text ?? null, next: open[1]?.text ?? null };
}

// Etapa que contém a atividade atual; se tudo está marcado, a última.
export function currentEtapaIndex(etapas: Etapa[]) {
  const i = etapas.findIndex((e) => e.atividades.some((a) => !a.done));
  return i === -1 ? etapas.length - 1 : i;
}

// Pré-visualização (R12): uma limpeza só no navegador, sem cronômetro, sem recorde e sem gravar nada.
export function previewView(pop: PopView): CleaningView {
  const etapas = pop.etapas.map((e) => ({ ...e, atividades: e.atividades.map((a) => ({ text: a.texto, descricao: a.descricao, done: false })) }));
  return {
    id: 'previa', environment: '', environmentName: pop.ambiente, status: 'in_progress', startedAt: '', activeMs: 0, running: false,
    endedAt: null, result: null, review: null, etapas,
    progress: { done: 0, total: etapas.reduce((n, e) => n + e.atividades.length, 0) },
  };
}

export function togglePreview(c: CleaningView, task: string, done: boolean): CleaningView {
  const etapas = c.etapas.map((e) => ({ ...e, atividades: e.atividades.map((a) => (a.text === task ? { ...a, done } : a)) }));
  return { ...c, etapas, progress: { ...c.progress, done: etapas.flatMap((e) => e.atividades).filter((a) => a.done).length } };
}
