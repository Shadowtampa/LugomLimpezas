import { encode } from '@toon-format/toon';
import { HttpError } from './http.ts';
import { readPopText } from './pops.ts';
import type { Deps } from './cleanings.ts';

// Tira a cerca ```toon ... ``` quando a IA devolve o POP todo dentro de um bloco de código.
export function unfence(text: string): string {
  const m = /^\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(text);
  return m ? m[1] + '\n' : text;
}

const RULES = `Você vai me ajudar a melhorar o POP (procedimento de limpeza) de um ambiente da minha casa. Abaixo estão o POP atual, em TOON, e os meus comentários de auto-avaliação das limpezas.

# Regras (importante)
1. NÃO altere nada ainda. Primeiro leia os comentários e me proponha as melhorias, uma por uma, dizendo o que mudaria e por quê (incluir, remover ou reordenar atividade; ajustar objetivo ou aviso; acrescentar descrição).
2. Não edite, remova nem renomeie nenhuma etapa ou atividade sem a minha aprovação. Espere a minha resposta antes de gerar qualquer coisa.
3. Comentários antigos podem já estar resolvidos no POP atual. Diga quais já estão.
4. Só depois que eu aprovar, gere o POP novo e completo em TOON, SEM os comentários, em um único bloco de código e sem texto dentro do bloco. Esse TOON vai sobrescrever o arquivo atual.

# Formato do TOON
- \`ambiente\`: nome do ambiente.
- \`etapas\`: lista (pelo menos uma) com \`titulo\`, \`objetivo\`, \`aviso\` (opcional) e \`atividades\` (pelo menos uma).
- Cada atividade é um texto simples ou um objeto com \`texto\` e \`descricao\` (curta, opcional, só para exibição).
- O texto da atividade é a identidade dela: mudar o texto zera o recorde de tempo. Só mude textos que eu aprovar; para esclarecer algo, use \`descricao\`. Nenhum texto de atividade pode se repetir.

Exemplo:
\`\`\`toon
ambiente: Escritório
etapas[1]:
  - titulo: Preparação
    objetivo: liberar as superfícies.
    atividades[2]:
      - Retirar copos e pratos.
      - texto: Recolher papéis espalhados.
        descricao: Junte tudo numa pilha para triar depois.
\`\`\``;

// Prompt do fluxo manual "melhorar com IA": regras + POP atual + todos os comentários (R11).
export function improvementPrompt(d: Deps, slug: string): string {
  const pop = readPopText(d.popsDir, slug);
  if (pop === null) throw new HttpError(404, 'ambiente não encontrado');
  const rows = d.db
    .prepare("SELECT started_at, score, improvements FROM cleanings WHERE environment = ? AND score IS NOT NULL AND TRIM(improvements) != '' ORDER BY started_at DESC, rowid DESC")
    .all(slug) as { started_at: string; score: number; improvements: string }[];
  if (rows.length === 0) throw new HttpError(409, 'ainda não há comentários neste ambiente: avalie uma limpeza concluída primeiro');
  const comentarios = encode({ comentarios: rows.map((r) => ({ data: r.started_at.slice(0, 10), nota: r.score, texto: r.improvements.trim() })) });
  return `${RULES}

# Nota da limpeza mais recente com comentário
${rows[0].score}/10

# POP atual
\`\`\`toon
${pop.trimEnd()}
\`\`\`

# Meus comentários (do mais recente para o mais antigo)
\`\`\`toon
${comentarios}
\`\`\`
`;
}
