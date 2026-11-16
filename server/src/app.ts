import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readAgenda, readAgendaText, writeAgendaText } from './agenda.ts';
import { abandonCleaning, cleaningView, deleteCleaning, environmentView, loadPop, recentCleanings, pauseCleaning, resumeCleaning, reviewCleaning, setTask, startCleaning, type Deps } from './cleanings.ts';
import { addNote, deleteNote } from './notes.ts';
import { improvementPrompt, unfence } from './improve.ts';
import { HttpError } from './http.ts';
import { listEnvironments, parsePop, PopError, readPopText, writePopText } from './pops.ts';

export type Config = Deps & { agendaFile: string; clientDir?: string };

const StartBody = z.object({ abandonCurrent: z.boolean().optional() });
const PopBody = z.object({ toon: z.string() });
const ImportBody = z.object({ filename: z.string(), toon: z.string(), replace: z.boolean().optional() });
const IMPORT_NAME = /^([a-z0-9-]+).toon$/;
const TaskBody = z.object({ task: z.string().min(1), done: z.boolean() });
const NoteBody = z.object({ text: z.string().trim().min(1).max(1000) });
const ReviewBody = z.object({ score: z.number().int().min(1).max(10), improvements: z.string().max(2000).default('') });

export function createApp(cfg: Config) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/environments', (_req, res) => { res.json(listEnvironments(cfg.popsDir)); });
  app.get('/api/environments/:slug', (req, res) => { res.json(environmentView(cfg, req.params.slug)); });
  app.post('/api/environments/:slug/cleanings', (req, res) => {
    const body = StartBody.safeParse(req.body ?? {});
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { abandonCurrent? }');
    res.status(201).json(startCleaning(cfg, req.params.slug, body.data.abandonCurrent));
  });
  app.get('/api/cleanings/:id', (req, res) => { res.json(cleaningView(cfg, req.params.id)); });
  app.post('/api/cleanings/:id/pause', (req, res) => { res.json(pauseCleaning(cfg, req.params.id)); });
  app.post('/api/cleanings/:id/resume', (req, res) => { res.json(resumeCleaning(cfg, req.params.id)); });
  app.post('/api/cleanings/:id/abandon', (req, res) => { res.json(abandonCleaning(cfg, req.params.id)); });
  app.delete('/api/cleanings/:id', (req, res) => { deleteCleaning(cfg, req.params.id); res.status(204).end(); });
  app.put('/api/cleanings/:id/tasks', (req, res) => {
    const body = TaskBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { task, done }');
    res.json(setTask(cfg, req.params.id, body.data.task, body.data.done));
  });
  app.put('/api/cleanings/:id/review', (req, res) => {
    const body = ReviewBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { score: 1 a 10, improvements? (até 2000 caracteres) }');
    res.json(reviewCleaning(cfg, req.params.id, body.data.score, body.data.improvements.trim()));
  });

  app.get('/api/environments/:slug/pop.toon', (req, res) => {
    const text = readPopText(cfg.popsDir, req.params.slug);
    if (text === null) throw new HttpError(404, 'ambiente não encontrado');
    res.attachment(`${req.params.slug}.toon`).type("text/plain; charset=utf-8").send(text);
  });
  // Pré-visualização (R12): o POP como a limpeza o mostra, sem criar limpeza.
  app.get('/api/environments/:slug/pop', (req, res) => { res.json(loadPop(cfg, req.params.slug)); });
  app.post('/api/pop-preview', (req, res) => {
    const body = PopBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { toon }');
    try { res.json(parsePop(unfence(body.data.toon), 'pré-visualização.toon')); }
    catch (e) {
      if (e instanceof PopError) throw new HttpError(400, e.message, { problem: e.problem });
      throw e;
    }
  });
  app.post('/api/environments/:slug/notes', (req, res) => {
    const body = NoteBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { text } com 1 a 1000 caracteres');
    res.status(201).json(addNote(cfg, req.params.slug, body.data.text));
  });
  app.delete('/api/environments/:slug/notes/:id', (req, res) => { deleteNote(cfg, req.params.slug, req.params.id); res.status(204).end(); });
  app.get('/api/environments/:slug/prompt-ia', (req, res) => {
    res.type('text/plain; charset=utf-8').send(improvementPrompt(cfg, req.params.slug));
  });
  app.put('/api/environments/:slug/pop', (req, res) => {
    if (readPopText(cfg.popsDir, req.params.slug) === null) throw new HttpError(404, 'ambiente não encontrado');
    const body = PopBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { toon }');
    try {
      writePopText(cfg.popsDir, req.params.slug, unfence(body.data.toon));
    } catch (e) {
      if (e instanceof PopError) throw new HttpError(400, e.message, { problem: e.problem });
      throw e;
    }
    res.json({ ok: true });
  });

  app.post('/api/environments/import', (req, res) => {
    const body = ImportBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { filename, toon, replace? }');
    const m = IMPORT_NAME.exec(body.data.filename);
    if (!m) throw new HttpError(400, 'nome de arquivo inválido: use só letras minúsculas, números e hífen, com a extensão .toon (ex.: quarto.toon)');
    const slug = m[1];
    let pop;
    try { pop = parsePop(body.data.toon, body.data.filename); }
    catch (e) {
      if (e instanceof PopError) throw new HttpError(400, e.message, { problem: e.problem });
      throw e;
    }
    const existing = readPopText(cfg.popsDir, slug);
    if (existing !== null && !body.data.replace) {
      let name = slug;
      try { name = parsePop(existing, `${slug}.toon`).ambiente; } catch { /* arquivo atual inválido: mostra o slug */ }
      throw new HttpError(409, `já existe o ambiente "${name}"`, { slug, name });
    }
    writePopText(cfg.popsDir, slug, body.data.toon);
    res.status(existing === null ? 201 : 200).json({ slug, name: pop.ambiente, replaced: existing !== null });
  });

  app.get('/api/dashboard', (_req, res) => {
    const { agenda, error } = readAgenda(cfg.agendaFile);
    const names = new Map(listEnvironments(cfg.popsDir).flatMap((e) => (e.name ? [[e.slug, e.name] as const] : [])));
    res.json({ agenda, agendaError: error ?? null, recent: recentCleanings(cfg, names) });
  });
  app.get('/api/agenda.toon', (_req, res) => {
    res.attachment('agenda.toon').type('text/plain; charset=utf-8').send(readAgendaText(cfg.agendaFile) ?? '');
  });
  app.put('/api/agenda', (req, res) => {
    const body = PopBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { toon }');
    try { writeAgendaText(cfg.agendaFile, body.data.toon); }
    catch (e) {
      if (e instanceof PopError) throw new HttpError(400, e.message, { problem: e.problem });
      throw e;
    }
    res.json({ ok: true });
  });

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'rota não encontrada' }); });

  if (cfg.clientDir && existsSync(cfg.clientDir)) {
    app.use(express.static(cfg.clientDir));
    app.get('/{*splat}', (_req, res) => { res.sendFile(join(cfg.clientDir!, 'index.html')); });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message, ...err.extra }); return; }
    if (err instanceof SyntaxError) { res.status(400).json({ error: 'JSON inválido' }); return; }
    console.error(err);
    res.status(500).json({ error: 'erro interno' });
  });
  return app;
}
