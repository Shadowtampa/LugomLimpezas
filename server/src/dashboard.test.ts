import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseAgenda } from './agenda.ts';
import { parsePop } from './pops.ts';
import { makeApp } from './testutil.ts';

const root = resolve(import.meta.dirname, '../..');
const s = (n: number) => n * 1000;

describe('agenda inicial e POP do quarto', () => {
  it('a agenda inicial segue o combinado', () => {
    const a = parseAgenda(readFileSync(join(root, 'agenda.toon'), 'utf8'));
    expect(a).toEqual({
      domingo: [],
      segunda: ['quarto'],
      terca: ['escritorio'],
      quarta: ['quarto'],
      quinta: ['escritorio'],
      sexta: ['quarto'],
      sabado: ['escritorio', 'banheiro-escritorio'],
    });
  });

  it('o POP do quarto é válido', () => {
    const pop = parsePop(readFileSync(join(root, 'pops/quarto.toon'), 'utf8'), 'quarto.toon');
    expect(pop.ambiente).toBe('Quarto');
    expect(pop.etapas.flatMap((e) => e.atividades)).toHaveLength(12);
  });
});

describe('agenda: validação', () => {
  it('dia ausente vira lista vazia; um único ambiente por dia funciona', () => {
    expect(parseAgenda('terca[1]: escritorio\n')).toMatchObject({ terca: ['escritorio'], quarta: [], domingo: [] });
  });
  it('chave errada (com acento) e slug inválido são recusados', () => {
    expect(() => parseAgenda('terça[1]: escritorio\n')).toThrow();
    expect(() => parseAgenda('terca[1]: Escritório\n')).toThrow(/sem \.toon/);
    expect(() => parseAgenda('terca[1]: ../x\n')).toThrow();
  });
});

describe('GET /api/dashboard', () => {
  it('sem arquivo de agenda: agenda vazia; últimas limpezas de todos os ambientes, da mais recente para a mais antiga', async () => {
    const c = makeApp();
    const empty = (await request(c.app).get('/api/dashboard')).body;
    expect(empty.agenda.sabado).toEqual([]);
    expect(empty.agendaError).toBeNull();
    expect(empty.recent).toEqual([]);

    const a = (await request(c.app).post('/api/environments/escritorio/cleanings')).body.id;
    c.clock.t += s(60);
    const b = (await request(c.app).post('/api/environments/banheiro-escritorio/cleanings')).body.id;
    c.clock.t += s(5);
    const d = (await request(c.app).get('/api/dashboard')).body;
    expect(d.recent.map((r: any) => r.id)).toEqual([b, a]);
    expect(d.recent[0]).toMatchObject({ environment: 'banheiro-escritorio', environmentName: 'Banheiro do escritório', status: 'in_progress', totalMs: s(5) });
    expect(d.recent[1]).toMatchObject({ environmentName: 'Escritório', totalMs: s(65) });
  });

  it('a agenda lida do arquivo aparece, e arquivo inválido mostra o erro sem derrubar o resto', async () => {
    const c = makeApp();
    writeFileSync(c.agendaFile, 'sabado[2]: escritorio,banheiro-escritorio\n');
    expect((await request(c.app).get('/api/dashboard')).body.agenda.sabado).toEqual(['escritorio', 'banheiro-escritorio']);
    await request(c.app).post('/api/environments/escritorio/cleanings');
    writeFileSync(c.agendaFile, 'terça[1]: x\n');
    const d = (await request(c.app).get('/api/dashboard')).body;
    expect(d.agendaError.file).toBe('agenda.toon');
    expect(d.agenda.terca).toEqual([]);
    expect(d.recent).toHaveLength(1);
  });
});

describe('editar a agenda', () => {
  it('grava exatamente o texto e exporta; inválida devolve 400 sem alterar o arquivo', async () => {
    const c = makeApp();
    const good = 'segunda[1]: quarto\r\nsabado[2]: escritorio,banheiro-escritorio\r\n';
    expect((await request(c.app).put('/api/agenda').send({ toon: good })).status).toBe(200);
    expect(readFileSync(c.agendaFile, 'utf8')).toBe(good);
    expect((await request(c.app).get('/api/agenda.toon')).text).toBe(good);
    const bad = await request(c.app).put('/api/agenda').send({ toon: 'terça[1]: x\n' });
    expect(bad.status).toBe(400);
    expect(bad.body.problem.file).toBe('agenda.toon');
    expect(readFileSync(c.agendaFile, 'utf8')).toBe(good);
  });
});
