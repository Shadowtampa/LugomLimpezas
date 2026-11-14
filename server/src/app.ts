import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { cleaningView, environmentView, pauseCleaning, resumeCleaning, setTask, startCleaning, type Deps } from './cleanings.ts';
import { HttpError } from './http.ts';
import { listEnvironments, PopError, readPopText, writePopText } from './pops.ts';

export type Config = Deps & { clientDir?: string };

const StartBody = z.object({ abandonCurrent: z.boolean().optional() });
const PopBody = z.object({ toon: z.string() });
const TaskBody = z.object({ task: z.string().min(1), done: z.boolean() });

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
  app.put('/api/cleanings/:id/tasks', (req, res) => {
    const body = TaskBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { task, done }');
    res.json(setTask(cfg, req.params.id, body.data.task, body.data.done));
  });

  app.get('/api/environments/:slug/pop.toon', (req, res) => {
    const text = readPopText(cfg.popsDir, req.params.slug);
    if (text === null) throw new HttpError(404, 'ambiente não encontrado');
    res.attachment(`${req.params.slug}.toon`).type("text/plain; charset=utf-8").send(text);
  });
  app.put('/api/environments/:slug/pop', (req, res) => {
    if (readPopText(cfg.popsDir, req.params.slug) === null) throw new HttpError(404, 'ambiente não encontrado');
    const body = PopBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'corpo inválido: esperado { toon }');
    try {
      writePopText(cfg.popsDir, req.params.slug, body.data.toon);
    } catch (e) {
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
