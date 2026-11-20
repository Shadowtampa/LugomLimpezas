import { encode } from '@toon-format/toon';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Deps } from './cleanings.ts';
import { HttpError } from './http.ts';
import { atomicWrite, listPops, parsePop, readPopText, SLUG_RE, type PopItem } from './pops.ts';

export const FIRST_POP = 'completo';

// "Banheiro do Escritório" -> "banheiro-do-escritorio"
export const slugify = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function envName(d: Deps, slug: string): string {
  const r = d.db.prepare('SELECT name FROM environments WHERE slug = ?').get(slug) as { name: string } | undefined;
  if (!r) throw new HttpError(404, 'ambiente não encontrado');
  return r.name;
}

export type EnvironmentItem = { slug: string; name: string; pops: PopItem[] };

export function listEnvironments(d: Deps): EnvironmentItem[] {
  return (d.db.prepare('SELECT slug, name FROM environments ORDER BY slug').all() as { slug: string; name: string }[])
    .map((e) => ({ ...e, pops: listPops(d.popsDir, e.slug) }));
}

const cleanName = (name: string) => {
  const n = name.trim();
  const slug = slugify(n);
  if (!slug || n.length > 100) throw new HttpError(400, 'nome inválido: use de 1 a 100 caracteres, com pelo menos uma letra ou número');
  return { name: n, slug };
};

export function createEnvironment(d: Deps, rawName: string) {
  const { name, slug } = cleanName(rawName);
  if (d.db.prepare('SELECT 1 FROM environments WHERE slug = ?').get(slug)) throw new HttpError(409, `já existe o ambiente "${slug}"`, { slug });
  d.db.prepare('INSERT INTO environments (slug, name) VALUES (?, ?)').run(slug, name);
  mkdirSync(join(d.popsDir, slug), { recursive: true });
  return { slug, name };
}

// Só o nome muda; o slug (pasta, limpezas, notas, agenda) fica.
export function renameEnvironment(d: Deps, slug: string, rawName: string) {
  envName(d, slug);
  const { name } = cleanName(rawName);
  d.db.prepare('UPDATE environments SET name = ? WHERE slug = ?').run(name, slug);
  return { slug, name };
}

// POP novo a partir de um modelo mínimo válido; o usuário completa no editor.
export function createPop(d: Deps, env: string, rawName: string) {
  envName(d, env);
  const { name, slug } = cleanName(rawName);
  if (readPopText(d.popsDir, env, slug) !== null) throw new HttpError(409, `já existe o POP "${slug}" neste ambiente`, { slug });
  // encode só no nome (põe aspas se preciso); o resto no formato expandido dos POPs, mais fácil de editar.
  const text = `${encode({ nome: name })}\netapas[1]:\n  - titulo: Etapa 1\n    objetivo: descreva o objetivo desta etapa.\n    atividades[2]:\n      - Primeira atividade.\n      - Segunda atividade.\n`;
  atomicWrite(join(d.popsDir, env, `${slug}.toon`), text);
  return { slug, name };
}

// Formato antigo -> novo, na inicialização (idempotente, não apaga nada):
// popsDir/<slug>.toon vira popsDir/<slug>/completo.toon com "nome: Completo" no topo, o nome do ambiente (campo `ambiente`)
// vai para o banco, e o arquivo antigo fica como <slug>.toon.migrado. Pastas sem linha no banco ganham uma com o próprio slug.
export function migratePopsDir(db: DatabaseSync, popsDir: string) {
  let entries: string[] = [];
  try { entries = readdirSync(popsDir); } catch { return; }
  const insert = db.prepare('INSERT OR IGNORE INTO environments (slug, name) VALUES (?, ?)');
  // Ordem pensada para uma queda no meio: banco antes do arquivo novo, e o antigo só sai depois.
  for (const f of entries.filter((f) => f.endsWith('.toon') && SLUG_RE.test(f.slice(0, -5)))) {
    const old = join(popsDir, f);
    const slug = f.slice(0, -5);
    const text = readFileSync(old, 'utf8').replace(/^\uFEFF/, '');
    let name = slug;
    try { name = parsePop(text, f).ambiente ?? slug; } catch { /* inválido: migra igual, com o slug como nome */ }
    insert.run(slug, name);
    const target = join(popsDir, slug, `${FIRST_POP}.toon`);
    if (existsSync(target)) continue; // já existe um "completo": não mexe nos arquivos
    atomicWrite(target, `nome: Completo\n${text}`);
    renameSync(old, `${old}.migrado`);
  }
  for (const f of readdirSync(popsDir)) if (SLUG_RE.test(f) && statSync(join(popsDir, f)).isDirectory()) insert.run(f, f);
}
