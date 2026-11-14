import type { Etapa } from './api.ts';

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
