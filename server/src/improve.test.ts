import { decode } from '@toon-format/toon';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

async function completedAndReviewed(c: ReturnType<typeof makeApp>, score: number, improvements: string) {
  const id = (await request(c.app).post('/api/environments/banheiro-escritorio/cleanings')).body.id;
  const view = (await request(c.app).get(`/api/cleanings/${id}`)).body;
  for (const t of view.etapas.flatMap((e: any) => e.atividades.map((a: any) => a.text))) {
    c.clock.t += 1000;
    await request(c.app).put(`/api/cleanings/${id}/tasks`).send({ task: t, done: true });
  }
  await request(c.app).put(`/api/cleanings/${id}/review`).send({ score, improvements });
  c.clock.t += 86_400_000;
}

describe('melhorar com IA', () => {
  it('o prompt traz as regras, o POP atual e TODOS os comentários (mais recente primeiro) com a última nota', async () => {
    const c = makeApp();
    await completedAndReviewed(c, 6, 'Falta passar pano nos rodapés.');
    await completedAndReviewed(c, 9, 'Linha 1\nLinha "2" com aspas');
    const r = await request(c.app).get('/api/environments/banheiro-escritorio/prompt-ia');
    expect(r.status).toBe(200);
    expect(r.type).toBe('text/plain');
    expect(r.text).toContain('NÃO altere nada ainda');
    expect(r.text).toContain('SEM os comentários');
    expect(r.text).toContain('9/10');
    expect(r.text).toContain(readFileSync(join(c.popsDir, 'banheiro-escritorio.toon'), 'utf8').trimEnd());
    const block = /# Meus comentários[^\n]*\n```toon\n([\s\S]*?)\n```/.exec(r.text)![1];
    const { comentarios } = decode(block) as { comentarios: { nota: number; texto: string }[] };
    expect(comentarios.map((x) => x.nota)).toEqual([9, 6]);
    expect(comentarios[0].texto).toBe('Linha 1\nLinha "2" com aspas');
  });

  it('409 sem comentários e 404 para ambiente inexistente', async () => {
    const c = makeApp();
    expect((await request(c.app).get('/api/environments/escritorio/prompt-ia')).status).toBe(409);
    expect((await request(c.app).get('/api/environments/nao-existe/prompt-ia')).status).toBe(404);
  });

  it('salvar o POP aceita o TOON dentro de uma cerca de código e grava sem a cerca', async () => {
    const c = makeApp();
    const toon = 'ambiente: Escritório\netapas[1]:\n  - titulo: A\n    objetivo: b.\n    atividades[1]:\n      - Fazer.\n';
    const r = await request(c.app).put('/api/environments/escritorio/pop').send({ toon: '```toon\n' + toon + '```\n' });
    expect(r.status).toBe(200);
    expect(readFileSync(join(c.popsDir, 'escritorio.toon'), 'utf8')).toBe(toon);
  });
});
