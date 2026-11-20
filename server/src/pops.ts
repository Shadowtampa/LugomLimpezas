import { decode } from '@toon-format/toon';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const MAX_POP_BYTES = 100 * 1024;
export const SLUG_RE = /^[a-z0-9-]+$/;

// Atividade: texto simples ou { texto, descricao? }. O texto é a identidade; a descrição é só exibição.
const Atividade = z.union([
  z.string().min(1).transform((texto) => ({ texto, descricao: undefined as string | undefined })),
  z.object({ texto: z.string().min(1), descricao: z.string().min(1).optional() }),
]);

const Etapa = z.object({
  titulo: z.string().min(1),
  objetivo: z.string().min(1),
  aviso: z.string().optional(),
  atividades: z.array(Atividade).min(1),
});

// `nome` é o nome do POP; `ambiente` sobra dos arquivos antigos e é ignorado (o nome do ambiente fica no banco).
const PopSchema = z.object({
  nome: z.string().min(1).optional(),
  ambiente: z.string().min(1).optional(),
  etapas: z.array(Etapa).min(1),
}).superRefine((pop, ctx) => {
  const seen = new Set<string>();
  for (const e of pop.etapas) for (const a of e.atividades) {
    if (seen.has(a.texto)) ctx.addIssue({ code: 'custom', message: `atividade repetida: "${a.texto}"` });
    seen.add(a.texto);
  }
});

export type Pop = z.infer<typeof PopSchema>;
export type PopProblem = { file: string; line?: number; message: string };

export class PopError extends Error {
  problem: PopProblem;
  constructor(problem: PopProblem) { super(problem.message); this.problem = problem; }
}

export const parsePop = (text: string, file: string): Pop => parseToon(text, file, PopSchema);

// Decodifica o TOON e valida com o schema; usado pelos POPs e pela agenda.
export function parseToon<S extends z.ZodType>(text: string, file: string, schema: S): z.output<S> {
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
  const r = schema.safeParse(data);
  if (!r.success) {
    const message = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; ');
    throw new PopError({ file, message });
  }
  return r.data;
}

export type PopItem = { slug: string; name?: string; error?: PopProblem };

// Um POP é popsDir/<ambiente>/<pop>.toon; os dois slugs são validados antes de virar caminho.
const popFile = (env: string, pop: string) => `${env}/${pop}.toon`;
const safe = (...slugs: string[]) => slugs.every((s) => SLUG_RE.test(s));

export function readPop(popsDir: string, env: string, pop: string): Pop {
  const file = popFile(env, pop);
  let text: string | null = null;
  if (safe(env, pop)) try { text = readFileSync(join(popsDir, file), 'utf8'); } catch { /* abaixo */ }
  if (text === null) throw new PopError({ file, message: 'arquivo não encontrado' });
  return parsePop(text, file);
}

export const popName = (pop: Pop, slug: string) => pop.nome ?? slug;

// Relido a cada chamada: editar o arquivo aparece ao recarregar (R1).
export function listPops(popsDir: string, env: string): PopItem[] {
  let files: string[] = [];
  if (safe(env)) try { files = readdirSync(join(popsDir, env)).filter((f) => f.endsWith('.toon') && safe(f.slice(0, -5))).sort(); } catch { /* pasta ausente = sem POPs */ }
  return files.map((f) => {
    const slug = f.slice(0, -'.toon'.length);
    try { return { slug, name: popName(readPop(popsDir, env, slug), slug) }; }
    catch (e) { return { slug, error: e instanceof PopError ? e.problem : { file: popFile(env, slug), message: String(e) } }; }
  });
}

// Texto exato do arquivo (mesmo que inválido), para exportar e abrir no editor.
export function readPopText(popsDir: string, env: string, pop: string): string | null {
  if (!safe(env, pop)) return null;
  try { return readFileSync(join(popsDir, popFile(env, pop)), 'utf8'); } catch { return null; }
}

// Escreve num temporário e renomeia: uma falha nunca deixa o arquivo pela metade.
export function atomicWrite(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`);
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

// Valida e grava exatamente o texto recebido.
export function writePopText(popsDir: string, env: string, pop: string, text: string): Pop {
  if (!safe(env, pop)) throw new PopError({ file: popFile(env, pop), message: 'nome inválido' });
  const parsed = parsePop(text, popFile(env, pop));
  atomicWrite(join(popsDir, popFile(env, pop)), text);
  return parsed;
}
