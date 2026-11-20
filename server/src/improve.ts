import { encode } from '@toon-format/toon';
import { HttpError } from './http.ts';
import { listNotes } from './notes.ts';
import { envName } from './environments.ts';
import { readPopText } from './pops.ts';
import type { Deps } from './cleanings.ts';

// Tira a cerca ```toon ... ``` quando a IA devolve o POP todo dentro de um bloco de código.
export function unfence(text: string): string {
  const m = /^\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(text);
  return m ? m[1] + '\n' : text;
}

const RULES = `Você vai me ajudar a melhorar o POP (procedimento de limpeza) de um ambiente da minha casa. Abaixo estão o POP atual, em TOON, os meus comentários de auto-avaliação das limpezas e as notas que anotei sobre o ambiente (ideias soltas, como algo a mais para organizar).

# Regras (importante)
1. NÃO altere nada ainda. Primeiro leia os comentários e as notas e me proponha as melhorias, uma por uma, dizendo o que mudaria e por quê (incluir, remover ou reordenar atividade; ajustar objetivo ou aviso; acrescentar descrição).
2. Não edite, remova nem renomeie nenhuma etapa ou atividade sem a minha aprovação. Espere a minha resposta antes de gerar qualquer coisa.
3. Comentários antigos podem já estar resolvidos no POP atual. Diga quais já estão.
4. Só depois que eu aprovar, gere o POP novo e completo em TOON, SEM os comentários, em um único bloco de código e sem texto dentro do bloco. Esse TOON vai sobrescrever o arquivo atual.

# Formato do TOON
- \`nome\`: nome do POP (ex.: Completo, Rápido).
- \`etapas\`: lista (pelo menos uma) com \`titulo\`, \`objetivo\`, \`aviso\` (opcional) e \`atividades\` (pelo menos uma).
- Cada atividade é um texto simples ou um objeto com \`texto\` e \`descricao\` (curta, opcional, só para exibição).
- O texto da atividade é a identidade dela: mudar o texto zera o recorde de tempo. Só mude textos que eu aprovar; para esclarecer algo, use \`descricao\`. Nenhum texto de atividade pode se repetir.

Exemplo:
\`\`\`toon
nome: Completo
etapas[1]:
  - titulo: Preparação
    objetivo: liberar as superfícies.
    atividades[2]:
      - Retirar copos e pratos.
      - texto: Recolher papéis espalhados.
        descricao: Junte tudo numa pilha para triar depois.
\`\`\``;

// Prompt do fluxo manual "melhorar com IA": regras + POP atual + comentários das limpezas (R10) e notas do ambiente (R13).
// Os comentários são das limpezas feitas com este POP; as notas são do ambiente.
export function improvementPrompt(d: Deps, slug: string, popSlug: string): string {
  envName(d, slug);
  const pop = readPopText(d.popsDir, slug, popSlug);
  if (pop === null) throw new HttpError(404, 'POP não encontrado');
  const rows = d.db
    .prepare("SELECT started_at, score, improvements FROM cleanings WHERE environment = ? AND pop = ? AND score IS NOT NULL AND TRIM(improvements) != '' ORDER BY started_at DESC, rowid DESC")
    .all(slug, popSlug) as { started_at: string; score: number; improvements: string }[];
  const notes = listNotes(d, slug);
  if (rows.length === 0 && notes.length === 0) throw new HttpError(409, 'ainda não há comentários neste POP nem notas no ambiente: avalie uma limpeza concluída ou adicione uma nota primeiro');
  const fence = '`'.repeat(3);
  const block = (title: string, data: object) => `\n# ${title}\n${fence}toon\n${encode(data)}\n${fence}\n`;
  const comentarios = rows.length
    ? `\n# Nota da limpeza mais recente com comentário\n${rows[0].score}/10\n`
    : '';
  return `${RULES}
${comentarios}
# POP atual
${fence}toon
${pop.trimEnd()}
${fence}
${rows.length ? block('Meus comentários das limpezas (do mais recente para o mais antigo)', { comentarios: rows.map((r) => ({ data: r.started_at.slice(0, 10), nota: r.score, texto: r.improvements.trim() })) }) : ''}${notes.length ? block('Minhas notas sobre o ambiente (ideias soltas, do mais recente para o mais antigo)', { notas: notes.map((n) => ({ data: n.createdAt.slice(0, 10), texto: n.text })) }) : ''}`;
}
