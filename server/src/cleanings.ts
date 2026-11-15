import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './db.ts';
import { HttpError } from './http.ts';
import { PopError, readPop, SLUG_RE, type Pop } from './pops.ts';

// `now` existe para os testes controlarem o relógio.
export type Deps = { db: DatabaseSync; popsDir: string; now?: () => number };

type CleaningRow = {
  id: string;
  environment: string;
  status: string;
  started_at: string;
  active_ms: number;
  running_since: string | null;
  ended_at: string | null;
  total_ms: number | null;
  score: number | null;
  improvements: string | null;
};

const nowMs = (d: Deps) => (d.now ? d.now() : Date.now());
const iso = (ms: number) => new Date(ms).toISOString();

// Tempo ativo agora = active_ms + (agora − running_since, se estiver correndo).
const activeMs = (row: CleaningRow, now: number) =>
  row.active_ms + (row.running_since ? now - Date.parse(row.running_since) : 0);

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
    .prepare('SELECT id, environment, status, started_at, active_ms, running_since, ended_at, total_ms, score, improvements FROM cleanings WHERE id = ?')
    .get(id) as CleaningRow | undefined;
  if (!row) throw new HttpError(404, 'limpeza não encontrada');
  return row;
}

function inProgress(d: Deps, slug: string) {
  return d.db.prepare("SELECT id FROM cleanings WHERE environment = ? AND status = 'in_progress'").get(slug) as { id: string } | undefined;
}

export function environmentView(d: Deps, slug: string) {
  const pop = loadPop(d, slug);
  const cur = inProgress(d, slug);
  let current = null;
  if (cur) {
    const view = cleaningView(d, cur.id);
    current = { id: cur.id, startedAt: view.startedAt, done: view.progress.done, total: view.progress.total };
  }
  return { slug, name: pop.ambiente, inProgress: current, fastestMs: fastestMs(d, slug), history: history(d, slug, pop) };
}

// R8: da mais recente para a mais antiga; progresso calculado contra o POP atual.
function history(d: Deps, slug: string, pop: Pop) {
  const inPop = new Set(allTasks(pop));
  const marked = new Map<string, number>();
  const rows = d.db.prepare("SELECT cleaning_id, task FROM cleaning_tasks WHERE cleaning_id IN (SELECT id FROM cleanings WHERE environment = ?)").all(slug) as { cleaning_id: string; task: string }[];
  for (const r of rows) if (inPop.has(r.task)) marked.set(r.cleaning_id, (marked.get(r.cleaning_id) ?? 0) + 1);
  const cleanings = d.db.prepare("SELECT id, environment, status, started_at, active_ms, running_since, ended_at, total_ms, score, improvements FROM cleanings WHERE environment = ? ORDER BY started_at DESC, rowid DESC").all(slug) as CleaningRow[];
  const now = nowMs(d);
  return cleanings.map((c) => ({
    id: c.id,
    startedAt: c.started_at,
    status: c.status,
    score: c.score,
    // concluída e abandonada: tempo gravado; em andamento: tempo corrido até agora
    totalMs: c.total_ms ?? activeMs(c, now),
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

function markAbandoned(d: Deps, row: CleaningRow) {
  const total = activeMs(row, nowMs(d));
  d.db.prepare("UPDATE cleanings SET status = 'abandoned', ended_at = ?, total_ms = ?, active_ms = ?, running_since = NULL WHERE id = ?")
    .run(iso(nowMs(d)), total, total, row.id);
}

// R3: abandono explícito; guarda o progresso e o tempo até aqui.
export function abandonCleaning(d: Deps, id: string) {
  const row = getRow(d, id);
  requireInProgress(row);
  markAbandoned(d, row);
  return cleaningView(d, id);
}

export function startCleaning(d: Deps, slug: string, abandonCurrent = false) {
  loadPop(d, slug);
  return transaction(d.db, () => {
    const existing = inProgress(d, slug);
    if (existing) {
      if (!abandonCurrent) throw new HttpError(409, 'já existe uma limpeza em andamento neste ambiente', { currentId: existing.id });
      // R3: a anterior vira abandonada (com o tempo até aqui) e a nova nasce na mesma transação.
      markAbandoned(d, getRow(d, existing.id));
    }
    const id = randomUUID();
    const t = iso(nowMs(d));
    d.db.prepare("INSERT INTO cleanings (id, environment, status, started_at, active_ms, running_since) VALUES (?, ?, 'in_progress', ?, 0, ?)")
      .run(id, slug, t, t);
    return { id };
  });
}

export function cleaningView(d: Deps, id: string) {
  const row = getRow(d, id);
  const pop = loadPop(d, row.environment);
  const laps = new Map(
    (d.db.prepare('SELECT task, lap_ms FROM cleaning_tasks WHERE cleaning_id = ?').all(id) as { task: string; lap_ms: number }[])
      .map((r) => [r.task, r.lap_ms]),
  );
  // R6: recorde = menor volta daquele texto neste ambiente em OUTRAS limpezas (qualquer status).
  const records = new Map(
    (d.db.prepare(
      `SELECT ct.task, MIN(ct.lap_ms) AS m FROM cleaning_tasks ct JOIN cleanings c ON c.id = ct.cleaning_id
       WHERE c.environment = ? AND ct.cleaning_id != ? GROUP BY ct.task`,
    ).all(row.environment, id) as { task: string; m: number }[]).map((r) => [r.task, r.m]),
  );
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
    activeMs: activeMs(row, nowMs(d)),
    running: row.running_since !== null,
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

function requireInProgress(row: CleaningRow) {
  if (row.status !== 'in_progress') throw new HttpError(409, 'a limpeza não está em andamento');
}

export function pauseCleaning(d: Deps, id: string) {
  const row = getRow(d, id);
  requireInProgress(row);
  if (row.running_since) {
    d.db.prepare('UPDATE cleanings SET active_ms = ?, running_since = NULL WHERE id = ?').run(activeMs(row, nowMs(d)), id);
  }
  return cleaningView(d, id);
}

export function resumeCleaning(d: Deps, id: string) {
  const row = getRow(d, id);
  requireInProgress(row);
  if (!row.running_since) {
    d.db.prepare('UPDATE cleanings SET running_since = ? WHERE id = ?').run(iso(nowMs(d)), id);
  }
  return cleaningView(d, id);
}

export function setTask(d: Deps, id: string, task: string, done: boolean) {
  const row = getRow(d, id);
  const pop = loadPop(d, row.environment);
  if (!allTasks(pop).includes(task)) throw new HttpError(400, 'atividade não existe no POP atual');
  if (row.status === 'abandoned') throw new HttpError(409, 'limpeza abandonada não aceita marcações');
  transaction(d.db, () => {
    if (done) {
      const already = d.db.prepare('SELECT 1 FROM cleaning_tasks WHERE cleaning_id = ? AND task = ?').get(id, task);
      if (already) return;
      const now = nowMs(d);
      const marked = activeMs(row, now);
      // R5: a volta conta desde a marcação mais recente ainda marcada (ou desde o início).
      const last = (d.db.prepare('SELECT MAX(marked_ms) AS m FROM cleaning_tasks WHERE cleaning_id = ?').get(id) as { m: number | null }).m ?? 0;
      d.db.prepare('INSERT INTO cleaning_tasks (cleaning_id, task, marked_ms, lap_ms, marked_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, task, marked, marked - last, iso(now));
      // R7: marcar a última atividade conclui a limpeza; o tempo total é o tempo ativo desta marcação.
      const markedTasks = new Set((d.db.prepare('SELECT task FROM cleaning_tasks WHERE cleaning_id = ?').all(id) as { task: string }[]).map((r) => r.task));
      if (row.status === 'in_progress' && allTasks(pop).every((t) => markedTasks.has(t))) {
        d.db.prepare("UPDATE cleanings SET status = 'completed', ended_at = ?, total_ms = ?, active_ms = ?, running_since = NULL WHERE id = ?")
          .run(iso(now), marked, marked, id);
      }
    } else {
      const removed = d.db.prepare('DELETE FROM cleaning_tasks WHERE cleaning_id = ? AND task = ?').run(id, task).changes;
      // Desmarcar numa concluída a devolve para em andamento, pausada.
      if (removed && row.status === 'completed') {
        d.db.prepare("UPDATE cleanings SET status = 'in_progress', ended_at = NULL, total_ms = NULL, running_since = NULL WHERE id = ?").run(id);
      }
    }
  });
  return cleaningView(d, id);
}

// R10: só uma limpeza concluída recebe nota; salvar de novo substitui a avaliação anterior.
export function reviewCleaning(d: Deps, id: string, score: number, improvements: string) {
  if (getRow(d, id).status !== 'completed') throw new HttpError(409, 'só uma limpeza concluída pode ser avaliada');
  d.db.prepare('UPDATE cleanings SET score = ?, improvements = ? WHERE id = ?').run(score, improvements, id);
  return cleaningView(d, id);
}

// Últimas limpezas de todos os ambientes, da mais recente para a mais antiga.
export function recentCleanings(d: Deps, names: Map<string, string>, limit = 50) {
  const rows = d.db.prepare("SELECT id, environment, status, started_at, active_ms, running_since, ended_at, total_ms FROM cleanings ORDER BY started_at DESC, rowid DESC LIMIT ?").all(limit) as CleaningRow[];
  const now = nowMs(d);
  return rows.map((c) => ({
    id: c.id,
    environment: c.environment,
    environmentName: names.get(c.environment) ?? c.environment,
    status: c.status,
    startedAt: c.started_at,
    endedAt: c.ended_at,
    totalMs: c.total_ms ?? activeMs(c, now),
  }));
}
