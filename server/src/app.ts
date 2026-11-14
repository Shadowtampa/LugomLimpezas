import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { listEnvironments } from './pops.ts';

export type Config = { popsDir: string; clientDir?: string };

export function createApp(cfg: Config) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/environments', (_req, res) => {
    res.json(listEnvironments(cfg.popsDir));
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'rota não encontrada' }); });

  if (cfg.clientDir && existsSync(cfg.clientDir)) {
    app.use(express.static(cfg.clientDir));
    app.get('/{*splat}', (_req, res) => { res.sendFile(join(cfg.clientDir!, 'index.html')); });
  }
  return app;
}
