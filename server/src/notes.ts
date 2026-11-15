import { randomUUID } from 'node:crypto';
import type { Deps } from './cleanings.ts';
import { HttpError } from './http.ts';
import { readPopText } from './pops.ts';

export type Note = { id: string; text: string; createdAt: string };

// Da mais recente para a mais antiga.
export function listNotes(d: Deps, slug: string): Note[] {
  return (d.db.prepare('SELECT id, text, created_at FROM environment_notes WHERE environment = ? ORDER BY created_at DESC, rowid DESC').all(slug) as { id: string; text: string; created_at: string }[])
    .map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at }));
}

export function addNote(d: Deps, slug: string, text: string): Note {
  if (readPopText(d.popsDir, slug) === null) throw new HttpError(404, 'ambiente não encontrado');
  const note = { id: randomUUID(), text, createdAt: new Date(d.now ? d.now() : Date.now()).toISOString() };
  d.db.prepare('INSERT INTO environment_notes (id, environment, text, created_at) VALUES (?, ?, ?, ?)').run(note.id, slug, text, note.createdAt);
  return note;
}

export function deleteNote(d: Deps, slug: string, id: string) {
  if (d.db.prepare('DELETE FROM environment_notes WHERE id = ? AND environment = ?').run(id, slug).changes === 0) throw new HttpError(404, 'nota não encontrada');
}
