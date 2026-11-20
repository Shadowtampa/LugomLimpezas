import { decode } from '@toon-format/toon';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp } from './testutil.ts';

describe('notas do ambiente', () => {
  it('adiciona, lista (mais recente primeiro) e exclui, só dentro do próprio ambiente', async () => {
    const c = makeApp();
    const add = (slug: string, text: string) => request(c.app).post(`/api/environments/${slug}/notes`).send({ text });
    const a = await add('escritorio', '  Organizar a penteadeira.  ');
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ text: 'Organizar a penteadeira.' });
    c.clock.t += 1000;
    const b = await add('escritorio', 'Trocar o mouse pad.');
    await add('banheiro-escritorio', 'Nota de outro ambiente.');

    const notes = async (slug: string) => (await request(c.app).get(`/api/environments/${slug}`)).body.notes;
    expect((await notes('escritorio')).map((n: any) => n.text)).toEqual(['Trocar o mouse pad.', 'Organizar a penteadeira.']);
    expect(await notes('banheiro-escritorio')).toHaveLength(1);

    expect((await request(c.app).delete(`/api/environments/banheiro-escritorio/notes/${a.body.id}`)).status).toBe(404);
    expect((await request(c.app).delete(`/api/environments/escritorio/notes/${a.body.id}`)).status).toBe(204);
    expect((await notes('escritorio')).map((n: any) => n.id)).toEqual([b.body.id]);
  });

  it('recusa nota vazia ou grande demais (400) e ambiente inexistente (404)', async () => {
    const c = makeApp();
    const add = (text: unknown, slug = 'escritorio') => request(c.app).post(`/api/environments/${slug}/notes`).send({ text } as object);
    for (const bad of ['', '   ', 'x'.repeat(1001), 5]) expect((await add(bad)).status).toBe(400);
    expect((await add('ok', 'nao-existe')).status).toBe(404);
  });

  it('as notas vão no prompt para a IA, mesmo sem comentários de limpeza; sem nada continua 409', async () => {
    const c = makeApp();
    expect((await request(c.app).get('/api/environments/escritorio/pops/completo/prompt-ia')).status).toBe(409);
    await request(c.app).post('/api/environments/escritorio/notes').send({ text: 'Organizar a penteadeira.' });
    const r = await request(c.app).get('/api/environments/escritorio/pops/completo/prompt-ia');
    expect(r.status).toBe(200);
    expect(r.text).not.toContain('Meus comentários das limpezas');
    const block = /# Minhas notas[^\n]*\n```toon\n([\s\S]*?)\n```/.exec(r.text)![1];
    expect((decode(block) as { notas: { texto: string }[] }).notas.map((n) => n.texto)).toEqual(['Organizar a penteadeira.']);
  });
});
