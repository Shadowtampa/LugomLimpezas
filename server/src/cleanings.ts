import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { HttpError } from './http.ts';
import { PopError, readPop, SLUG_RE, type Pop } from './pops.ts';

export type Deps = { db: DatabaseSync; popsDir: string };

type CleaningRow = { id: string; environment: string; status: string; started_at: string };

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
  const row = d.db.prepare('SELECT id, environment, status, started_at FROM cleanings WHERE id = ?').get(id) as CleaningRow | undefined;
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
  d.db.prepare("INSERT INTO cleanings (id, environment, status, started_at, active_ms) VALUES (?, ?, 'in_progress', ?, 0)")
    .run(id, slug, new Date().toISOString());
  return { id };
}

export function cleaningView(d: Deps, id: string) {
  const row = getRow(d, id);
  const pop = loadPop(d, row.environment);
  const marked = new Set(
    (d.db.prepare('SELECT task FROM cleaning_tasks WHERE cleaning_id = ?').all(id) as { task: string }[]).map((r) => r.task),
  );
  const etapas = pop.etapas.map((e) => ({
    titulo: e.titulo,
    objetivo: e.objetivo,
    aviso: e.aviso,
    atividades: e.atividades.map((text) => ({ text, done: marked.has(text) })),
  }));
  const tasks = allTasks(pop);
  return {
    id: row.id,
    environment: row.environment,
    environmentName: pop.ambiente,
    status: row.status,
    startedAt: row.started_at,
    etapas,
    progress: { done: tasks.filter((t) => marked.has(t)).length, total: tasks.length },
  };
}

export function setTask(d: Deps, id: string, task: string, done: boolean) {
  const row = getRow(d, id);
  const pop = loadPop(d, row.environment);
  if (!allTasks(pop).includes(task)) throw new HttpError(400, 'atividade não existe no POP atual');
  if (row.status === 'abandoned') throw new HttpError(409, 'limpeza abandonada não aceita marcações');
  if (done) {
    d.db.prepare('INSERT OR IGNORE INTO cleaning_tasks (cleaning_id, task, marked_ms, lap_ms, marked_at) VALUES (?, ?, 0, 0, ?)')
      .run(id, task, new Date().toISOString());
  } else {
    d.db.prepare('DELETE FROM cleaning_tasks WHERE cleaning_id = ? AND task = ?').run(id, task);
  }
  return cleaningView(d, id);
}
