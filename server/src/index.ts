import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.ts';

const root = resolve(import.meta.dirname, '../..');
try { process.loadEnvFile(resolve(root, '.env')); } catch { /* .env é opcional */ }

const popsDir = resolve(root, process.env.POPS_DIR ?? 'data/pops');
const port = Number(process.env.PORT ?? 10061);

// Primeira inicialização: copia os POPs iniciais para a pasta em uso.
mkdirSync(popsDir, { recursive: true });
if (readdirSync(popsDir).length === 0 && existsSync(resolve(root, 'pops'))) {
  cpSync(resolve(root, 'pops'), popsDir, { recursive: true });
}

createApp({ popsDir, clientDir: resolve(root, 'client/dist') })
  .listen(port, () => console.log(`Lugom Limpezas em http://localhost:${port}`));
