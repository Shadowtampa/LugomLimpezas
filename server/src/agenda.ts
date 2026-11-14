import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { atomicWrite, parseToon, PopError, SLUG_RE, type PopProblem } from './pops.ts';

// Chaves sem acento, na ordem de Date.getDay() (domingo = 0).
export const DAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
export type Agenda = Record<(typeof DAYS)[number], string[]>;

const Slugs = z.array(z.string().regex(SLUG_RE, 'use o nome do arquivo do ambiente, sem .toon')).default([]);
// strict: uma chave errada (ex.: "terça") é erro, não um dia silenciosamente vazio.
const AgendaSchema = z.object(Object.fromEntries(DAYS.map((d) => [d, Slugs])) as Record<(typeof DAYS)[number], typeof Slugs>).strict();

const empty = (): Agenda => Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as Agenda;

export const parseAgenda = (text: string): Agenda => parseToon(text, 'agenda.toon', AgendaSchema);

// Relida a cada chamada. Sem arquivo: agenda vazia. Arquivo inválido: agenda vazia e o problema.
export function readAgenda(file: string): { agenda: Agenda; error?: PopProblem } {
  let text: string;
  try { text = readFileSync(file, 'utf8'); } catch { return { agenda: empty() }; }
  try { return { agenda: parseAgenda(text) }; }
  catch (e) { if (e instanceof PopError) return { agenda: empty(), error: e.problem }; throw e; }
}

export const readAgendaText = (file: string): string | null => {
  try { return readFileSync(file, 'utf8'); } catch { return null; }
};

export function writeAgendaText(file: string, text: string) {
  parseAgenda(text);
  atomicWrite(file, text);
}
