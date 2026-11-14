import { decode } from '@toon-format/toon';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const MAX_POP_BYTES = 100 * 1024;
export const SLUG_RE = /^[a-z0-9-]+$/;

const Etapa = z.object({
  titulo: z.string().min(1),
  objetivo: z.string().min(1),
  aviso: z.string().optional(),
  atividades: z.array(z.string().min(1)).min(1),
});

const PopSchema = z.object({
  ambiente: z.string().min(1),
  etapas: z.array(Etapa).min(1),
}).superRefine((pop, ctx) => {
  const seen = new Set<string>();
  for (const e of pop.etapas) for (const a of e.atividades) {
    if (seen.has(a)) ctx.addIssue({ code: 'custom', message: `atividade repetida: "${a}"` });
    seen.add(a);
  }
});

export type Pop = z.infer<typeof PopSchema>;
export type PopProblem = { file: string; line?: number; message: string };

export class PopError extends Error {
  problem: PopProblem;
  constructor(problem: PopProblem) { super(problem.message); this.problem = problem; }
}

export function parsePop(text: string, file: string): Pop {
  if (Buffer.byteLength(text) > MAX_POP_BYTES) throw new PopError({ file, message: 'arquivo acima de 100 KB' });
  let data: unknown;
  try {
    // strict:false -> os contadores [N] não são exigidos (R1)
    data = decode(text, { strict: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /^Line (\d+):\s*(.*)$/s.exec(msg);
    throw new PopError({ file, line: m ? Number(m[1]) : undefined, message: m ? m[2] : msg });
  }
  const r = PopSchema.safeParse(data);
  if (!r.success) {
    const message = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; ');
    throw new PopError({ file, message });
  }
  return r.data;
}

export type EnvironmentItem = { slug: string; name?: string; error?: PopProblem };

export function readPop(popsDir: string, slug: string): Pop {
  const file = `${slug}.toon`;
  let text: string;
  try { text = readFileSync(join(popsDir, file), 'utf8'); }
  catch { throw new PopError({ file, message: 'arquivo não encontrado' }); }
  return parsePop(text, file);
}

// Relido a cada chamada: editar o arquivo aparece ao recarregar (R1).
export function listEnvironments(popsDir: string): EnvironmentItem[] {
  let files: string[] = [];
  try { files = readdirSync(popsDir).filter((f) => f.endsWith('.toon')).sort(); } catch { /* pasta ausente = lista vazia */ }
  return files.map((f) => {
    const slug = f.slice(0, -'.toon'.length);
    try { return { slug, name: readPop(popsDir, slug).ambiente }; }
    catch (e) { return { slug, error: e instanceof PopError ? e.problem : { file: f, message: String(e) } }; }
  });
}

// Texto exato do arquivo (mesmo que inválido), para exportar e abrir no editor.
export function readPopText(popsDir: string, slug: string): string | null {
  if (!SLUG_RE.test(slug)) return null;
  try { return readFileSync(join(popsDir, `${slug}.toon`), 'utf8'); } catch { return null; }
}

// Valida e grava exatamente o texto recebido; escreve num temporário e renomeia (atômico).
export function writePopText(popsDir: string, slug: string, text: string): Pop {
  const file = `${slug}.toon`;
  const pop = parsePop(text, file);
  mkdirSync(popsDir, { recursive: true });
  const tmp = join(popsDir, `.${slug}.${randomUUID()}.tmp`);
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, join(popsDir, file));
  return pop;
}
