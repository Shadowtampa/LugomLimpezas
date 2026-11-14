import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
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

const allTasks = (pop: Pop) => pop.etapas.flatMap((e) => e.atividades);

function getRow(d: Deps, id: string): CleaningRow {
  const row = d.db
    .prepare('SELECT id, environment, status, started_at, active_ms, running_since FROM cleanings WHERE id = ?')
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
  return { slug, name: pop.ambiente, inProgress: current };
}

export function startCleaning(d: Deps, slug: string) {
  loadPop(d, slug);
  const existing = inProgress(d, slug);
  if (existing) throw new HttpError(409, 'já existe uma limpeza em andamento neste ambiente', { currentId: existing.id });
  const id = randomUUID();
  const t = iso(nowMs(d));
  d.db.prepare("INSERT INTO cleanings (id, environment, status, started_at, active_ms, running_since) VALUES (?, ?, 'in_progress', ?, 0, ?)")
    .run(id, slug, t, t);
  return { id };
}

export function cleaningView(d: Deps, id: string) {
  const row = getRow(d, id);
  const pop = loadPop(d, row.environment);
  const laps = new Map(
    (d.db.prepare('SELECT task, lap_ms FROM cleaning_tasks WHERE cleaning_id = ?').all(id) as { task: string; lap_ms: number }[])
      .map((r) => [r.task, r.lap_ms]),
  );
  const etapas = pop.etapas.map((e) => ({
    titulo: e.titulo,
    objetivo: e.objetivo,
    aviso: e.aviso,
    atividades: e.atividades.map((text) => ({ text, done: laps.has(text), lapMs: laps.get(text) })),
  }));
  const tasks = allTasks(pop);
  return {
    id: row.id,
    environment: row.environment,
    environmentName: pop.ambiente,
    status: row.status,
    startedAt: row.started_at,
    activeMs: activeMs(row, nowMs(d)),
    running: row.running_since !== null,
    etapas,
    progress: { done: tasks.filter((t) => laps.has(t)).length, total: tasks.length },
  };
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
  if (done) {
    const already = d.db.prepare('SELECT 1 FROM cleaning_tasks WHERE cleaning_id = ? AND task = ?').get(id, task);
    if (!already) {
      const now = nowMs(d);
      const marked = activeMs(row, now);
      // R5: a volta conta desde a marcação mais recente ainda marcada (ou desde o início).
      const last = (d.db.prepare('SELECT MAX(marked_ms) AS m FROM cleaning_tasks WHERE cleaning_id = ?').get(id) as { m: number | null }).m ?? 0;
      d.db.prepare('INSERT INTO cleaning_tasks (cleaning_id, task, marked_ms, lap_ms, marked_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, task, marked, marked - last, iso(now));
    }
  } else {
    d.db.prepare('DELETE FROM cleaning_tasks WHERE cleaning_id = ? AND task = ?').run(id, task);
  }
  return cleaningView(d, id);
}
