import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction } from './db.ts';
import { HttpError } from './http.ts';
import { listNotes } from './notes.ts';
import { PopError, readPop, SLUG_RE, type Pop } from './pops.ts';

// `now` existe para os testes controlarem o relógio das notas.
export type Deps = { db: DatabaseSync; popsDir: string; now?: () => number };

type CleaningRow = {
  id: string;
  environment: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_ms: number | null;
  score: number | null;
  improvements: string | null;
};

const iso = (ms: number) => new Date(ms).toISOString();

export function loadPop(d: Deps, slug: string): Pop {
  if (!SLUG_RE.test(slug)) throw new HttpError(404, 'ambiente não encontrado');
  try { return readPop(d.popsDir, slug); }
  catch (e) {
    if (!(e instanceof PopError)) throw e;
    if (e.problem.message === 'arquivo não encontrado') throw new HttpError(404, 'ambiente não encontrado');
    throw new HttpError(422, `POP inválido: ${e.message}`, { problem: e.problem });
  }
}

const allTasks = (pop: Pop) => pop.etapas.flatMap((e) => e.atividades.map((a) => a.texto));

function getRow(d: Deps, id: string): CleaningRow {
  const row = d.db
    .prepare('SELECT id, environment, status, started_at, ended_at, total_ms, score, improvements FROM cleanings WHERE id = ?')
    .get(id) as CleaningRow | undefined;
  if (!row) throw new HttpError(404, 'limpeza não encontrada');
  return row;
}

export function environmentView(d: Deps, slug: string) {
  const pop = loadPop(d, slug);
  return { slug, name: pop.ambiente, total: allTasks(pop).length, fastestMs: fastestMs(d, slug), history: history(d, slug, pop), notes: listNotes(d, slug) };
}

// R8: da mais recente para a mais antiga; progresso calculado contra o POP atual.
function history(d: Deps, slug: string, pop: Pop) {
  const inPop = new Set(allTasks(pop));
  const marked = new Map<string, number>();
  const rows = d.db.prepare("SELECT cleaning_id, task FROM cleaning_tasks WHERE cleaning_id IN (SELECT id FROM cleanings WHERE environment = ?)").all(slug) as { cleaning_id: string; task: string }[];
  for (const r of rows) if (inPop.has(r.task)) marked.set(r.cleaning_id, (marked.get(r.cleaning_id) ?? 0) + 1);
  const cleanings = d.db.prepare("SELECT id, environment, status, started_at, ended_at, total_ms, score, improvements FROM cleanings WHERE environment = ? ORDER BY started_at DESC, rowid DESC").all(slug) as CleaningRow[];
  return cleanings.map((c) => ({
    id: c.id,
    startedAt: c.started_at,
    status: c.status,
    score: c.score,
    totalMs: c.total_ms ?? 0,
    done: marked.get(c.id) ?? 0,
    total: inPop.size,
  }));
}

// Limpeza mais rápida: menor tempo total entre as concluídas, opcionalmente sem contar uma delas.
function fastestMs(d: Deps, slug: string, exceptId = ''): number | null {
  const r = d.db
    .prepare("SELECT MIN(total_ms) AS m FROM cleanings WHERE environment = ? AND status = 'completed' AND id != ?")
    .get(slug, exceptId) as { m: number | null };
  return r.m;
}

// R6: recorde = menor volta daquele texto neste ambiente em OUTRAS limpezas (qualquer status).
export function taskRecords(d: Deps, slug: string, exceptId = '') {
  return new Map(
    (d.db.prepare(
      `SELECT ct.task, MIN(ct.lap_ms) AS m FROM cleaning_tasks ct JOIN cleanings c ON c.id = ct.cleaning_id
       WHERE c.environment = ? AND ct.cleaning_id != ? GROUP BY ct.task`,
    ).all(slug, exceptId) as { task: string; m: number }[]).map((r) => [r.task, r.m]),
  );
}

export function cleaningView(d: Deps, id: string) {
  const row = getRow(d, id);
  const pop = loadPop(d, row.environment);
  const laps = new Map(
    (d.db.prepare('SELECT task, lap_ms FROM cleaning_tasks WHERE cleaning_id = ?').all(id) as { task: string; lap_ms: number }[])
      .map((r) => [r.task, r.lap_ms]),
  );
  const records = taskRecords(d, row.environment, id);
  const etapas = pop.etapas.map((e) => ({
    titulo: e.titulo,
    objetivo: e.objetivo,
    aviso: e.aviso,
    atividades: e.atividades.map(({ texto: text, descricao }) => {
      const lapMs = laps.get(text);
      const recordMs = records.get(text);
      const deltaMs = lapMs !== undefined && recordMs !== undefined ? lapMs - recordMs : undefined;
      return { text, descricao, done: laps.has(text), lapMs, recordMs, deltaMs };
    }),
  }));
  const tasks = allTasks(pop);
  let result = null;
  if (row.status === 'completed' && row.total_ms !== null) {
    const fastestOther = fastestMs(d, row.environment, id);
    result = {
      totalMs: row.total_ms,
      fastestOtherMs: fastestOther,
      diffMs: fastestOther === null ? null : row.total_ms - fastestOther,
      newRecord: fastestOther === null || row.total_ms < fastestOther,
      brokenRecords: etapas.flatMap((e) => e.atividades)
        .filter((a) => a.deltaMs !== undefined && a.deltaMs < 0)
        .map((a) => ({ text: a.text, lapMs: a.lapMs!, recordMs: a.recordMs! })),
    };
  }
  return {
    id: row.id,
    environment: row.environment,
    environmentName: pop.ambiente,
    status: row.status,
    startedAt: row.started_at,
    activeMs: row.total_ms ?? 0,
    running: false,
    endedAt: row.ended_at,
    result,
    review: row.score === null ? null : { score: row.score, improvements: row.improvements ?? '' },
    etapas,
    progress: { done: tasks.filter((t) => laps.has(t)).length, total: tasks.length },
  };
}

// R3: só uma limpeza abandonada pode ser excluída; as voltas dela saem dos recordes (R6).
export function deleteCleaning(d: Deps, id: string) {
  if (getRow(d, id).status !== 'abandoned') throw new HttpError(409, 'só uma limpeza abandonada pode ser excluída');
  transaction(d.db, () => {
    d.db.prepare('DELETE FROM cleaning_tasks WHERE cleaning_id = ?').run(id);
    d.db.prepare('DELETE FROM cleanings WHERE id = ?').run(id);
  });
}

// R10: só uma limpeza concluída recebe nota; salvar de novo substitui a avaliação anterior.
export function reviewCleaning(d: Deps, id: string, score: number, improvements: string) {
  if (getRow(d, id).status !== 'completed') throw new HttpError(409, 'só uma limpeza concluída pode ser avaliada');
  d.db.prepare('UPDATE cleanings SET score = ?, improvements = ? WHERE id = ?').run(score, improvements, id);
  return cleaningView(d, id);
}

// Últimas limpezas de todos os ambientes, da mais recente para a mais antiga.
export function recentCleanings(d: Deps, names: Map<string, string>, limit = 50) {
  const rows = d.db.prepare("SELECT id, environment, status, started_at, ended_at, total_ms FROM cleanings ORDER BY started_at DESC, rowid DESC LIMIT ?").all(limit) as CleaningRow[];
  return rows.map((c) => ({
    id: c.id,
    environment: c.environment,
    environmentName: names.get(c.environment) ?? c.environment,
    status: c.status,
    startedAt: c.started_at,
    endedAt: c.ended_at,
    totalMs: c.total_ms ?? 0,
  }));
}

const Evento = z.object({
  tipo: z.enum(['inicio', 'feito', 'desmarcar', 'pausa', 'retomada', 'abandono']),
  atividade: z.string().min(1).optional(),
  em: z.iso.datetime(),
});
export const SubmitBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  ambiente: z.string(),
  status: z.enum(['concluida', 'abandonada']),
  eventos: z.array(Evento).min(1).max(1000),
});
export type Submit = z.infer<typeof SubmitBody>;

// O envio único: o navegador manda o rascunho (eventos com horário) e o servidor recalcula tempo, voltas e conclusão (R5, R7).
// Repetir o mesmo id devolve a limpeza já gravada (created: false).
export function submitCleaning(d: Deps, b: Submit) {
  const pop = loadPop(d, b.ambiente);
  const existing = d.db.prepare('SELECT environment FROM cleanings WHERE id = ?').get(b.id) as { environment: string } | undefined;
  if (existing) {
    if (existing.environment !== b.ambiente) throw new HttpError(409, 'este id já pertence a outro ambiente');
    return { created: false, view: cleaningView(d, b.id) };
  }
  const times = b.eventos.map((e) => Date.parse(e.em));
  if (b.eventos[0].tipo !== 'inicio' || b.eventos.slice(1).some((e) => e.tipo === 'inicio')) throw new HttpError(400, 'o primeiro evento, e só ele, deve ser "inicio"');
  // Só barra relógio absurdo (data no futuro distante); o aparelho pode adiantar um pouco.
  if (times[times.length - 1] > (d.now ? d.now() : Date.now()) + 86_400_000) throw new HttpError(400, 'horário dos eventos no futuro');
  if (times.some((t, i) => i > 0 && t < times[i - 1])) throw new HttpError(400, 'eventos fora de ordem de horário');
  if (b.eventos.some((e) => (e.tipo === 'feito' || e.tipo === 'desmarcar') && !e.atividade)) throw new HttpError(400, 'evento sem atividade');

  const tasks = allTasks(pop);
  let active = 0;
  let since: number | null = times[0];
  const activeAt = (t: number) => active + (since === null ? 0 : t - since);
  const laps = new Map<string, { markedMs: number; lapMs: number; at: number }>();
  let doneAt: { ms: number; at: number } | null = null;
  for (const [i, e] of b.eventos.entries()) {
    const t = times[i];
    if (e.tipo === 'pausa' && since !== null) { active = activeAt(t); since = null; }
    else if (e.tipo === 'retomada' && since === null) since = t;
    else if (e.tipo === 'feito' && tasks.includes(e.atividade!) && !laps.has(e.atividade!)) {
      // R5: a volta conta desde a marcação mais recente ainda marcada (ou desde o início).
      const ms = activeAt(t);
      const last = Math.max(0, ...[...laps.values()].map((l) => l.markedMs));
      laps.set(e.atividade!, { markedMs: ms, lapMs: ms - last, at: t });
      // R7: marcar a última atividade conclui; o total é o tempo ativo desta marcação.
      doneAt = laps.size === tasks.length ? { ms, at: t } : null;
    } else if (e.tipo === 'desmarcar' && laps.delete(e.atividade!)) doneAt = null;
  }

  const end = times[times.length - 1];
  const completed = b.status === 'concluida' && doneAt !== null;
  const total = completed ? doneAt!.ms : activeAt(end);
  transaction(d.db, () => {
    d.db.prepare("INSERT INTO cleanings (id, environment, status, started_at, ended_at, active_ms, total_ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(b.id, b.ambiente, completed ? 'completed' : 'abandoned', iso(times[0]), iso(completed ? doneAt!.at : end), total, total);
    const insert = d.db.prepare('INSERT INTO cleaning_tasks (cleaning_id, task, marked_ms, lap_ms, marked_at) VALUES (?, ?, ?, ?, ?)');
    for (const [task, l] of laps) insert.run(b.id, task, l.markedMs, l.lapMs, iso(l.at));
  });
  return { created: true, view: cleaningView(d, b.id) };
}
