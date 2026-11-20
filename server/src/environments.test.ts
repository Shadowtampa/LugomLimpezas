import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { migratePopsDir, slugify } from './environments.ts';
import { abandoned, ev, finish, makeApp, submit, tasksOf } from './testutil.ts';

const A = 'Retirar copos, garrafas, pratos e utensílios de alimentação.';
const RAPIDO = 'nome: Rápido\netapas[1]:\n  - titulo: Mesa\n    objetivo: o\n    atividades[2]:\n      - Retirar copos, garrafas, pratos e utensílios de alimentação.\n      - Passar pano.\n';

// Banco no formato anterior (até a migração 004), com limpeza, voltas, avaliação e nota.
function legacyDb(path: string) {
  const db = openDb(path);
  db.exec('DROP TABLE environments; ALTER TABLE cleanings DROP COLUMN pop; PRAGMA user_version = 4');
  db.prepare("INSERT INTO cleanings (id, environment, status, started_at, ended_at, active_ms, total_ms, score, improvements) VALUES ('c1', 'quarto', 'completed', '2026-01-01T10:00:00.000Z', '2026-01-01T10:01:00.000Z', 60000, 60000, 8, 'ok')").run();
  db.prepare("INSERT INTO cleaning_tasks (cleaning_id, task, marked_ms, lap_ms, marked_at) VALUES ('c1', 'Arrumar a cama', 60000, 60000, '2026-01-01T10:01:00.000Z')").run();
  db.prepare("INSERT INTO environment_notes (id, environment, text, created_at) VALUES ('n1', 'quarto', 'Trocar cortina', '2026-01-01T09:00:00.000Z')").run();
  db.close();
}

describe('migração para vários POPs por ambiente', () => {
  it('cada .toon vira o ambiente com o POP "Completo", sem perder limpezas, voltas, avaliações e notas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    const popsDir = join(dir, 'pops');
    const dbPath = join(dir, 'lugom.db');
    const quarto = 'ambiente: Quarto\netapas[1]:\n  - titulo: Cama\n    objetivo: o\n    atividades[1]:\n      - Arrumar a cama\n';
    legacyDb(dbPath);
    mkdirSync(popsDir);
    writeFileSync(join(popsDir, 'quarto.toon'), '﻿' + quarto);
    writeFileSync(join(popsDir, 'quebrado.toon'), 'lixo: [');

    const db = openDb(dbPath);
    migratePopsDir(db, popsDir);
    migratePopsDir(db, popsDir); // idempotente

    expect(readFileSync(join(popsDir, 'quarto', 'completo.toon'), 'utf8')).toBe('nome: Completo\n' + quarto);
    expect(readFileSync(join(popsDir, 'quarto.toon.migrado'), 'utf8')).toBe('﻿' + quarto); // original guardado
    expect(existsSync(join(popsDir, 'quarto.toon'))).toBe(false);
    expect(readFileSync(join(popsDir, 'quebrado', 'completo.toon'), 'utf8')).toBe('nome: Completo\nlixo: [');

    const app = createApp({ popsDir, db, agendaFile: join(dir, 'agenda.toon') });
    const list = (await request(app).get('/api/environments')).body;
    expect(list.map((e: any) => [e.slug, e.name])).toEqual([['quarto', 'Quarto'], ['quebrado', 'quebrado']]);
    expect(list[0].pops).toEqual([{ slug: 'completo', name: 'Completo' }]);

    const env = (await request(app).get('/api/environments/quarto')).body;
    expect(env.history).toMatchObject([{ id: 'c1', pop: 'completo', popName: 'Completo', status: 'completed', score: 8, totalMs: 60000, done: 1, total: 1 }]);
    expect(env.pops[0].fastestMs).toBe(60000);
    expect(env.notes).toMatchObject([{ id: 'n1', text: 'Trocar cortina' }]);
    expect((await request(app).get('/api/environments/quarto/pops/completo/records')).body).toEqual({ 'Arrumar a cama': 60000 });
    expect((await request(app).get('/api/cleanings/c1')).body).toMatchObject({ environmentName: 'Quarto', popName: 'Completo', review: { score: 8, improvements: 'ok' } });
  });
});

describe('ambientes e POPs', () => {
  it('cria e renomeia um ambiente; o slug não muda', async () => {
    const c = makeApp();
    const r = await request(c.app).post('/api/environments').send({ name: ' Área de Serviço ' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ slug: 'area-de-servico', name: 'Área de Serviço' });
    expect((await request(c.app).post('/api/environments').send({ name: 'area de servico' })).status).toBe(409);
    expect((await request(c.app).post('/api/environments').send({ name: '!!!' })).status).toBe(400);
    expect((await request(c.app).get('/api/environments/area-de-servico')).body).toMatchObject({ name: 'Área de Serviço', pops: [], history: [] });

    expect((await request(c.app).put('/api/environments/escritorio').send({ name: 'Home office' })).body).toEqual({ slug: 'escritorio', name: 'Home office' });
    expect((await request(c.app).get('/api/environments/escritorio')).body.name).toBe('Home office');
    expect((await request(c.app).put('/api/environments/nada').send({ name: 'X' })).status).toBe(404);
  });

  it('cria um POP novo válido, que abre no editor e pode ser salvo', async () => {
    const c = makeApp();
    const r = await request(c.app).post('/api/environments/escritorio/pops').send({ name: 'Rápido' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ slug: 'rapido', name: 'Rápido' });
    expect((await request(c.app).get('/api/environments/escritorio/pops/rapido')).body.nome).toBe('Rápido');
    expect((await request(c.app).post('/api/environments/escritorio/pops').send({ name: 'rapido' })).status).toBe(409);
    expect((await request(c.app).put('/api/environments/escritorio/pops/rapido').send({ toon: RAPIDO })).status).toBe(200);
    expect((await request(c.app).get('/api/environments/escritorio')).body.pops.map((p: any) => [p.slug, p.total])).toEqual([['completo', 31], ['rapido', 2]]);
  });

  it('a limpeza registra o POP; recordes, mais rápida e histórico são por POP', async () => {
    const c = makeApp();
    await request(c.app).post('/api/environments/escritorio/pops').send({ name: 'Rápido' });
    await request(c.app).put('/api/environments/escritorio/pops/rapido').send({ toon: RAPIDO });
    await abandoned(c, 30, [[30, A]]); // completo
    const rapidoTasks = await tasksOf(c, 'escritorio', 'rapido');
    const r = await submit(c, [ev(0, 'inicio'), ...rapidoTasks.map((t) => ev(10, 'feito', t))], { pop: 'rapido' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ pop: 'rapido', popName: 'Rápido', status: 'completed', progress: { done: 2, total: 2 } });

    expect((await request(c.app).get('/api/environments/escritorio/pops/completo/records')).body).toEqual({ [A]: 30000 });
    expect((await request(c.app).get('/api/environments/escritorio/pops/rapido/records')).body).toEqual({ [A]: 10000, 'Passar pano.': 0 });
    const env = (await request(c.app).get('/api/environments/escritorio')).body;
    expect(env.pops.map((p: any) => p.fastestMs)).toEqual([null, 10000]);
    expect(env.history.map((h: any) => [h.popName, h.done, h.total])).toEqual([['Rápido', 2, 2], ['Completo', 1, 31]]);

    await finish(c, 50);
    expect((await request(c.app).get('/api/environments/escritorio')).body.pops.map((p: any) => p.fastestMs)).toEqual([50000, 10000]);
    expect((await submit(c, [ev(0, 'inicio')], { pop: 'nada', status: 'abandonada' })).status).toBe(404);
  });

  it('slugify tira acentos e símbolos', () => {
    expect(slugify('Banheiro do Escritório!')).toBe('banheiro-do-escritorio');
  });
});
