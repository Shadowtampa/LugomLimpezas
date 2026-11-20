# Projeto: Lugom Limpezas

## 1. Visão geral

Aplicação web, hospedada no home lab, que guia a limpeza dos ambientes da
casa como um jogo de corrida. Você escolhe um ambiente, aperta start, e o
sistema diz o que fazer agora e o que vem depois, enquanto cronometra cada
atividade como uma volta e compara com o seu recorde.

Não é um sistema de auditoria. O POP é uma sugestão editável, e o histórico
existe para mostrar tempos, não para provar o que foi feito.

Vocabulário: ver [CONTEXT.md](CONTEXT.md).

## 2. Stack

- **Frontend:** React + TypeScript + Vite, CSS puro (variáveis CSS).
- **Backend:** Node 24 + Express + Zod.
- **Banco:** SQLite pelo módulo embutido `node:sqlite`, sem ORM.
- **POPs:** arquivos TOON lidos com `@toon-format/toon`.
- **Testes:** Vitest (+ supertest na API).
- **Repositório:** `client/` e `server/` na raiz, com npm workspaces.
- **Deploy:** serviço systemd no servidor do home lab; o Express serve a API e
  o build do React (seção 11).

O navegador nunca acessa o SQLite nem os arquivos TOON diretamente.

## 3. Fluxo principal

1. Você abre o Lugom Limpezas pelo dashboard do home lab.
2. A tela inicial lista os ambientes (Escritório, Banheiro do escritório…).
3. Ao escolher um ambiente, você vê:
   - a **limpeza mais rápida** daquele ambiente;
   - o **histórico** de limpezas;
   - o botão **Iniciar limpeza**, e também **Continuar limpeza** se houver
     uma em andamento.
4. **Iniciar limpeza** é um clique: o cronômetro dispara na hora, sem
   formulário.
5. A tela da limpeza mostra o cronômetro, a etapa atual, a atividade atual
   com o recorde dela, a próxima atividade e a lista completa clicável.
6. Ao marcar uma atividade, o tempo dela (a volta) é gravado e comparado com
   o recorde: **−0:12** em verde se foi mais rápido, **+0:08** em vermelho se
   foi mais lento.
7. Ao marcar a última atividade, a limpeza termina sozinha e mostra a tela de
   resultado.

## 4. Regras

### R1. Ambientes e POPs

- Um ambiente (slug e nome) fica na tabela `environments` e tem um ou mais POPs
  (#39). Cada POP é o arquivo `<ambiente>/<pop>.toon` na pasta de POPs
  (`POPS_DIR`, seção 11); o campo `nome` é o nome do POP (ex.: Completo, Rápido).
- O ambiente é criado e renomeado pela interface (o slug não muda). O POP é
  criado (modelo mínimo aberto no editor), importado (R9) ou editado na tela do
  ambiente. Ao iniciar uma limpeza o usuário escolhe o POP; com um só, ele já vem
  escolhido. A limpeza grava o POP usado (`cleanings.pop`).
- Recordes por atividade e a limpeza mais rápida são por POP. As notas (R13)
  são do ambiente. O prompt da IA (R11) usa o POP escolhido, os comentários das
  limpezas desse POP e as notas do ambiente.
- Migração: na inicialização, cada arquivo antigo `<slug>.toon` vira o ambiente
  `<slug>` com o POP `completo` (o arquivo original fica como
  `<slug>.toon.migrado`), e as limpezas antigas ficam com `pop = 'completo'`.
- Os arquivos são lidos a cada requisição, para que uma edição apareça ao
  recarregar a página, sem reiniciar o serviço.
- Depois de decodificar, o conteúdo é validado com Zod. Se um arquivo for
  inválido, só aquele ambiente mostra o erro (arquivo, linha quando houver e
  problema); os outros continuam funcionando.
- Os contadores `[N]` do TOON não são exigidos: uma lista com mais ou menos
  itens que o declarado é aceita.

### R2. Ordem

- A atividade atual é a primeira atividade não marcada, na ordem do POP. A
  próxima é a seguinte não marcada.
- A ordem é só orientação: qualquer atividade pode ser marcada ou desmarcada
  pela lista, a qualquer momento, enquanto a limpeza estiver em andamento.

### R3. Iniciar e abandonar

- Pode haver no máximo uma limpeza em andamento por ambiente: o rascunho local
  do ambiente (R14).
- Iniciar com um rascunho em andamento exige confirmação na tela: *"A limpeza
  de DD/MM (23/44) será marcada como abandonada. Continuar?"*. Ao confirmar, o
  rascunho anterior é enviado como abandonado (R14) e o novo nasce.
- Também dá para abandonar sem iniciar outra: o botão **Abandonar limpeza** da
  tela da limpeza pede confirmação e envia o rascunho como abandonado. Tempo e
  progresso ficam guardados, só para consulta.

- **Excluir:** só uma limpeza abandonada pode ser excluída, pelo botão
  **Excluir** do histórico do ambiente (R8) ou da tela dela, com confirmação.
  Isso apaga a limpeza e as voltas dela, que deixam de valer para os recordes
  (R6), e não dá para desfazer. Em limpeza em andamento ou concluída, o
  backend responde `409`.

### R4. Cronômetro e pausa

- O tempo conta a partir do clique em Iniciar.
- **Pausar/Continuar** suspende e retoma a contagem. O tempo pausado não conta
  em nada.
- O relógio de referência é o do navegador, que anota o horário de cada
  evento (R14); o servidor recalcula os tempos a partir deles e o tempo
  continua correndo com a aba fechada, até pausar.

### R5. Volta (tempo de uma atividade)

- O tempo de uma atividade é o tempo ativo (sem pausas) desde a marcação mais
  recente ainda marcada até esta marcação, ou desde o início, se não houver
  nenhuma.
- Marcar fora de ordem segue a mesma regra.
- Desmarcar apaga a volta daquela atividade, que deixa de contar para o
  recorde.

### R6. Recordes

- O **recorde de uma atividade** é a menor volta já registrada para aquele
  texto de atividade naquele ambiente, em qualquer limpeza (concluída,
  abandonada ou em andamento), sem contar a limpeza atual.
- A comparação (−/+) é feita contra esse recorde. Uma volta abaixo dele é um
  recorde novo.
- A **limpeza mais rápida** é o menor tempo total entre as limpezas
  concluídas do ambiente.
- A atividade é identificada pelo próprio texto: editar o texto cria uma
  atividade nova, com o recorde zerado.

### R7. Fim da limpeza

- Quando todas as atividades do POP atual estão marcadas, o navegador envia o
  rascunho (R14) e o backend grava a limpeza como `completed`; o tempo total é
  o tempo ativo no momento da última marcação.
- A tela de resultado mostra o tempo total, a diferença para a limpeza mais
  rápida e os recordes de atividade batidos.
- Uma limpeza enviada é definitiva: já não dá para desmarcar atividades dela.
- Limpezas abandonadas são só para consulta.

### R14. Rascunho no navegador e envio único

- A limpeza em andamento não existe no servidor: é um rascunho em JSON no
  `localStorage` (chave `limpeza:<ambiente>`), com o `id` (UUID gerado no
  navegador), o ambiente e uma lista de eventos com horário: `inicio`,
  `feito`, `desmarcar`, `pausa`, `retomada` e `abandono`. Cada interação
  acrescenta um evento; a tela é montada a partir deles e sobrevive a recarregar.
- Ao abrir a limpeza, o navegador lê só o POP e os recordes. Durante o fluxo
  não há nenhuma outra requisição.
- Ao marcar a última atividade, ou ao abandonar, o rascunho vai num único
  `POST /cleanings`. Se falhar, o rascunho fica, a tela mostra o erro e o botão
  **Tentar enviar de novo**; ele só é apagado depois que o servidor confirma.
- O servidor recalcula tempo, voltas (R5) e conclusão (R7) a partir dos eventos.
- A avaliação (R10) continua numa requisição própria, na tela de resultado.
- A limpeza em andamento só aparece no aparelho onde foi iniciada.
- Migração 004: as limpezas `in_progress` que existiam no servidor viram
  `abandoned`.

### R8. Histórico

- Uma lista por ambiente, da mais recente para a mais antiga, com data, tempo
  total (ou o tempo até o abandono), status e progresso (`23/44`).
- O progresso é calculado contra o POP atual: o histórico não precisa ser
  fiel a versões antigas do POP.
- Não há tela de detalhes própria: a data de cada limpeza, aqui e no Painel,
  abre a tela da limpeza (resultado e Avaliação, se concluída; consulta, se
  abandonada).

### R9. Importar, editar e exportar POPs

- O arquivo na pasta de POPs é a única fonte do POP. Não há cópia no banco nem
  histórico de versões; quem quiser backup exporta antes de editar.
- **Editar:** uma caixa de texto com o conteúdo TOON do arquivo e o botão
  **Salvar**. Antes de gravar, o sistema decodifica e valida o texto (R1). Se
  houver erro, mostra o problema (com a linha, quando houver) e não grava
  nada. O texto é gravado exatamente como foi digitado, sem reformatar.
- **Importar:** envio de um arquivo `.toon` pela tela do ambiente. O nome do
  arquivo vira o slug do POP, que só pode ter letras minúsculas, números e hífen.
  Se o POP já existir, a tela pergunta *"Substituir o POP <nome>?"*; sem a
  confirmação explícita no corpo da requisição, o backend responde `409`.
- **Exportar:** o botão **Baixar .toon** entrega o arquivo exatamente como
  ele está gravado.
- A gravação é atômica (escreve num arquivo temporário e renomeia), para que
  uma falha nunca deixe o arquivo pela metade.
- Editar ou substituir um POP com uma limpeza em andamento é permitido. As
  atividades novas aparecem na lista; as removidas saem do progresso, mas as
  voltas já gravadas continuam no banco e seguem valendo para os recordes.
- Limpezas e recordes ficam ligados ao slug do ambiente e ao texto das
  atividades, não ao arquivo: substituir o arquivo não apaga nada.
- Limite de tamanho do arquivo: 100 KB.

### R10. Auto-avaliação

- Uma Limpeza concluída pode receber uma **Avaliação**: uma nota inteira de 1 a
  10 (obrigatória) e um texto livre com os pontos a melhorar (opcional, até
  2000 caracteres).
- A Avaliação aparece na tela de resultado, onde também é feita. Salvar de novo
  substitui a anterior. Só limpezas concluídas aceitam Avaliação (`409` nas
  outras).
- Desmarcar uma atividade reabre a limpeza (R7), mas a Avaliação já salva
  fica guardada e volta a aparecer quando ela for concluída de novo.
- O histórico do ambiente (R8) mostra a nota de cada limpeza avaliada.

### R11. Melhorar o POP com IA (processo manual)

- Na tela do ambiente, **Melhorar com IA (processo manual)** monta um prompt e o
  copia (se o navegador não permitir, o texto aparece selecionado para copiar).
  O prompt traz: as regras para a IA, o formato do TOON, a nota da limpeza mais
  recente com comentário, o POP atual e **todos** os comentários (R10) do
  ambiente, do mais recente para o mais antigo, também em TOON.
- As regras mandam a IA **não alterar nada antes de eu aprovar**: primeiro ela
  propõe as melhorias, e só depois da aprovação gera o POP novo completo em
  TOON, **sem os comentários**, num único bloco de código.
- A volta é manual: o TOON novo é colado em **Editar POP**, que valida e
  sobrescreve o arquivo (R9). Se o texto vier dentro de uma cerca ```toon, o
  servidor tira a cerca antes de validar e gravar.
- Sem nenhum comentário no ambiente, o botão avisa (`409`).

### R12. Pré-visualização

- **Pré-visualizar** (tela do ambiente) abre a tela da limpeza como se uma
  tivesse sido iniciada: etapa atual, **Agora** com o botão **Feito**, próxima
  atividade e a lista completa com checkboxes. A diferença: não há cronômetro,
  recorde nem resultado, e nada é enviado ao servidor. As marcações vivem só na
  página; **Recomeçar prévia** zera, e recarregar também.
- Não cria limpeza, não grava nada e não mexe em recordes nem no histórico.
- Em **Editar POP**, **Pré-visualizar** faz o mesmo com o texto digitado, antes
  de salvar (útil para conferir o TOON devolvido pela IA, R11). Texto inválido
  mostra o erro (com a linha, quando houver) em vez da prévia.

### R13. Notas do ambiente

- Uma **Nota** é um texto solto (até 1000 caracteres) sobre o ambiente, sem
  ligação com uma limpeza: por exemplo, *"organizar a penteadeira"*. Dá para
  adicionar e excluir, na tela do ambiente, em qualquer momento.
- As notas vão no prompt para a IA (R11), ao lado dos comentários das limpezas,
  e o botão passa a funcionar com só notas ou só comentários. Sem nenhum dos
  dois, responde `409`.
- Nada as apaga sozinho: depois que a IA aplicou uma ideia, exclua a nota.

## 5. Formato do arquivo TOON

```toon
ambiente: Escritório
etapas[2]:
  - titulo: Desocupação e preparação do ambiente
    objetivo: liberar as superfícies e preparar o ambiente para a limpeza.
    atividades[2]:
      - Retirar copos, garrafas, pratos e utensílios de alimentação.
      - texto: Recolher papéis, documentos e objetos espalhados.
        descricao: Junte tudo numa pilha para triar depois.
  - titulo: Limpeza do piso e finalização
    objetivo: concluir a higienização.
    aviso: A limpeza do piso deve ser feita após as demais atividades.
    atividades[1]:
      - Varrer ou aspirar todo o piso do escritório.
```

- `ambiente` (obrigatório): nome exibido.
- `etapas` (obrigatório, pelo menos uma): cada uma com `titulo`, `objetivo`,
  `atividades` (pelo menos uma) e `aviso` (opcional).
- Cada atividade é um texto simples ou um objeto `texto` + `descricao`
  (opcional), e os dois formatos podem se misturar na mesma lista. A
  descrição é curta e só serve para exibição.
- Dentro de um mesmo arquivo, o texto de uma atividade não pode se repetir,
  porque é ele que identifica a atividade. Mudar só a descrição não cria uma
  atividade nova nem zera o recorde.

## 6. Conteúdo inicial dos POPs

Os textos abaixo viram os arquivos iniciais. A ordem e a redação vêm do POP
original; você edita os arquivos à vontade depois.

### `pops/escritorio.toon` (ambiente: Escritório)

**Etapa 1. Desocupação e preparação do ambiente**
Objetivo: liberar as superfícies e preparar o ambiente para a limpeza.

1. Retirar copos, garrafas, pratos e utensílios de alimentação.
2. Recolher papéis, documentos e objetos espalhados.
3. Separar os materiais que são lixo e descartá-los corretamente.
4. Retirar objetos desnecessários das mesas e bancadas.
5. Guardar materiais de escritório em seus respectivos lugares.
6. Recolher roupas deixadas no escritório, colocando-as no cesto de roupas
   sujas ou guardando-as adequadamente.
7. Esvaziar as lixeiras do escritório e do banheiro.
8. Retirar objetos do chão que dificultem a limpeza.

**Etapa 2. Limpeza dos equipamentos eletrônicos**
Objetivo: remover poeira e sujeira dos equipamentos sem danificá-los.

1. Desligar monitores e equipamentos antes da limpeza.
2. Limpar as telas com pano de microfibra apropriado.
3. Limpar teclado, mouse e mousepad.
4. Remover poeira dos suportes articulados dos monitores.
5. Limpar notebooks e demais equipamentos.
6. Limpar cabos e periféricos externamente.
7. Verificar e organizar os fios e conexões.

**Etapa 3. Limpeza dos móveis e superfícies**
Objetivo: higienizar todas as superfícies e estruturas do escritório.

1. Limpar mesas e bancadas.
2. Limpar prateleiras, armários e gaveteiros externamente.
3. Limpar cadeiras, braços e encostos.
4. Limpar pés das mesas e estruturas de apoio.
5. Remover poeira de objetos decorativos.
6. Limpar maçanetas, interruptores e pontos de contato frequente.

**Etapa 4. Limpeza do piso e finalização**
Objetivo: concluir a higienização e devolver o ambiente em condições
adequadas de utilização.
Aviso: Utilizar produtos adequados para cada superfície e manter os
materiais de limpeza do banheiro separados dos utilizados no escritório. A
limpeza do piso deve ser realizada após as demais atividades, evitando
retrabalho.

1. Varrer ou aspirar todo o piso do escritório.
2. Limpar os rodapés.
3. Limpar a área abaixo das mesas e móveis.
4. Passar pano úmido com produto adequado ao revestimento.
5. Verificar se não existem manchas ou resíduos no chão.
6. Recolocar cadeiras e objetos em seus lugares.
7. Conferir se todas as lixeiras estão limpas e com sacos novos.
8. Verificar a organização geral do ambiente.
9. Conferir se o banheiro está abastecido e pronto para uso.
10. Desligar as luzes e equipamentos que não precisam permanecer ligados.

### `pops/banheiro-escritorio.toon` (ambiente: Banheiro do escritório)

**Etapa 1. Limpeza e higienização do banheiro**
Objetivo: garantir condições adequadas de higiene, conservação e utilização
do banheiro.
Aviso: Utilizar panos e utensílios exclusivos para o banheiro. Nunca misturar
água sanitária com ácidos, amônia ou outros produtos de limpeza.

1. Retirar lixo da lixeira e substituir o saco.
2. Recolher objetos e materiais espalhados.
3. Aplicar produto de limpeza adequado no vaso sanitário e higienizar
   internamente.
4. Limpar a parte externa do vaso sanitário, incluindo tampa, assento e base.
5. Higienizar a pia e a torneira.
6. Limpar o espelho.
7. Limpar bancada e demais superfícies.
8. Limpar paredes e revestimentos quando necessário.
9. Lavar ou limpar o piso com produto apropriado.
10. Limpar maçanetas e pontos de contato.
11. Repor papel higiênico, sabonete líquido e papel-toalha, quando aplicável.
12. Verificar se há odores, vazamentos ou problemas aparentes.
13. Deixar o banheiro ventilado e em condições de uso.

Observação: as atividades 1.7 e 4.9 do Escritório ainda citam o banheiro.
Elas foram mantidas como no original; ajuste os arquivos se quiser.

## 7. Modelo de dados (SQLite)

O POP não fica no banco, só as limpezas.

### `cleanings`

| Campo            | Tipo              | Descrição                                                    |
| ---------------- | ----------------- | ------------------------------------------------------------ |
| `id`             | TEXT PRIMARY KEY  | UUID                                                         |
| `environment`    | TEXT NOT NULL     | Slug do ambiente (nome do arquivo TOON)                      |
| `status`         | TEXT NOT NULL     | `in_progress`, `completed` ou `abandoned`                    |
| `started_at`     | TEXT NOT NULL     | Data/hora do início (ISO 8601)                               |
| `ended_at`       | TEXT NULL         | Data/hora da conclusão ou do abandono                        |
| `active_ms`      | INTEGER NOT NULL  | Tempo ativo acumulado até a última pausa                     |
| `running_since`  | TEXT NULL         | Quando o cronômetro foi retomado; `NULL` se estiver pausado  |
| `total_ms`       | INTEGER NULL      | Tempo total; preenchido ao concluir ou abandonar             |
| `score`          | INTEGER NULL      | Nota da auto-avaliação, de 1 a 10 (R10)                      |
| `improvements`   | TEXT NULL         | Pontos a melhorar da auto-avaliação (R10)                    |

Tempo ativo agora = `active_ms` + (agora − `running_since`, se não for nulo).

Índice parcial único: `UNIQUE(environment) WHERE status = 'in_progress'`.

### `environment_notes`

| Campo         | Tipo              | Descrição                         |
| ------------- | ----------------- | --------------------------------- |
| `id`          | TEXT PRIMARY KEY  | UUID                              |
| `environment` | TEXT NOT NULL     | Slug do ambiente                  |
| `text`        | TEXT NOT NULL     | Texto da nota (R13)               |
| `created_at`  | TEXT NOT NULL     | Data/hora da criação (ISO 8601)   |

### `cleaning_tasks`

Uma linha por atividade marcada; desmarcar apaga a linha.

| Campo          | Tipo              | Descrição                                      |
| -------------- | ----------------- | ---------------------------------------------- |
| `cleaning_id`  | TEXT NOT NULL     | Referência a `cleanings.id`                    |
| `task`         | TEXT NOT NULL     | Texto da atividade (sua identidade)            |
| `marked_ms`    | INTEGER NOT NULL  | Tempo ativo da limpeza no momento da marcação  |
| `lap_ms`       | INTEGER NOT NULL  | Volta (R5)                                     |
| `marked_at`    | TEXT NOT NULL     | Data/hora da marcação                          |

`PRIMARY KEY(cleaning_id, task)`; índice em `task` para buscar recordes.

As migrations são arquivos `.sql` numerados, aplicados na inicialização por
um runner mínimo baseado em `PRAGMA user_version`.

## 8. API REST

Prefixo `/api`. Toda entrada é validada com Zod.

| Método | Rota                                   | Finalidade                                                                 |
| ------ | -------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/environments`                        | Lista os ambientes (slug, nome) com os POPs de cada um (slug, nome ou erro do arquivo) |
| POST   | `/environments`                        | Corpo `{ "name" }`; cria o ambiente (slug a partir do nome). Já existe: `409` |
| GET    | `/environments/:slug`                  | Nome, POPs (total de atividades e limpeza mais rápida de cada um), histórico e notas |
| PUT    | `/environments/:slug`                  | Corpo `{ "name" }`; renomeia o ambiente                                     |
| POST   | `/environments/:slug/pops`             | Corpo `{ "name" }`; cria um POP com um modelo mínimo. Já existe: `409`     |
| POST   | `/cleanings`                           | O envio único da limpeza (R14). `201` ao gravar; `200` se o mesmo `id` já foi gravado |
| GET    | `/environments/:slug/pops/:pop/records` | Menor volta de cada atividade no POP, `{ "<texto>": ms }`                  |
| GET    | `/cleanings/:id`                       | Estado, tarefas marcadas com voltas e recorde de cada atividade            |
| DELETE | `/cleanings/:id`                       | Exclui uma limpeza abandonada (R3) e suas voltas. Outro status: `409`; `204` ao excluir |
| PUT    | `/cleanings/:id/review`                | Corpo `{ "score": 1-10, "improvements": "<texto>" }`; grava a auto-avaliação (R10). Nota inválida: `400`; limpeza não concluída: `409` |
| GET    | `/environments/:slug/pops/:pop/pop.toon` | Exporta o arquivo TOON como download                                       |
| GET    | `/dashboard`                           | Agenda por dia da semana e as últimas 50 limpezas de todos os ambientes (seção 15) |
| GET    | `/agenda.toon`                         | Exporta o arquivo da agenda                                                |
| PUT    | `/agenda`                              | Corpo `{ "toon": "<texto>" }`; valida e grava a agenda. Erro de validação: `400` |
| GET    | `/environments/:slug/pops/:pop`        | O POP atual decodificado, para a pré-visualização (R12)                    |
| POST   | `/pop-preview`                         | Corpo `{ "toon": "<texto>" }`; devolve o POP decodificado sem gravar. Inválido: `400` |
| POST   | `/environments/:slug/notes`            | Corpo `{ "text": "<1 a 1000 caracteres>" }`; adiciona uma nota (R13). Inválido: `400` |
| DELETE | `/environments/:slug/notes/:id`        | Exclui a nota do ambiente (`204`; `404` se não existe)                      |
| GET    | `/environments/:slug/pops/:pop/prompt-ia` | Texto do prompt para melhorar o POP com IA (R11). Sem comentários: `409`   |
| PUT    | `/environments/:slug/pops/:pop`        | Corpo `{ "toon": "<texto>" }`; valida e grava (R9). Erro de validação: `400` |
| POST   | `/environments/:slug/pops/import`      | Corpo `{ "filename": "x.toon", "toon": "<texto>", "replace": true }`; cria ou substitui o POP. POP existente sem `replace`: `409` |

O `POST /cleanings` recebe o rascunho inteiro (R14), valida com Zod e grava a
limpeza, as voltas e o resultado numa transação:

- `400` para corpo inválido, eventos fora de ordem de horário, primeiro evento
  que não é `inicio` (ou outro `inicio` depois) e `feito`/`desmarcar` sem
  atividade, mais de 1000 eventos ou horário mais de 1 dia no futuro;
  `404` para ambiente inexistente;
- ignora atividades que não existem mais no POP atual;
- `status: "concluida"` só vale se todas as atividades do POP atual estão
  marcadas (R7); senão a limpeza é gravada como `abandoned`, com o que foi feito;
- é idempotente pelo `id`: reenviar devolve a limpeza já gravada (`200`);
  `id` de outro ambiente: `409`;
- responde com o estado da limpeza, incluindo voltas, recordes e, ao concluir,
  o resultado.

## 9. Telas

### 9.1. Início
Nome **Lugom Limpezas**, a lista de ambientes e o botão **Importar .toon**.
Um ambiente com o arquivo inválido aparece com o erro, e o POP dele ainda
pode ser aberto no editor para correção.

### 9.2. Ambiente
Nome do ambiente, limpeza mais rápida, **Iniciar limpeza** (com a confirmação
de abandono da R3, quando for o caso), **Continuar limpeza** se houver uma
em andamento, o histórico (R8) e os botões **Editar POP** e **Baixar .toon**.

### 9.3. Limpeza
- Cronômetro em destaque, com **Pausar/Continuar**.
- Etapa atual (título, objetivo e aviso, se houver).
- Atividade atual com o recorde dela e o botão **Feito**.
- Próxima atividade.
- Lista completa por etapa, com checkboxes e a volta e a diferença (−/+) de
  cada atividade marcada.
- Progresso geral (`23/44`).

### 9.4. Resultado
Tempo total, diferença para a limpeza mais rápida (ou *"Novo recorde!"*), as
atividades em que você bateu o recorde, o formulário de auto-avaliação (nota
de 1 a 10 e *"O que eu poderia melhorar?"*) e um botão para voltar ao ambiente.

### 9.5. Editar POP
Caixa de texto com o TOON do arquivo (fonte monoespaçada), **Salvar** e
**Cancelar**. Um erro de validação aparece acima da caixa e o texto
digitado é mantido. Sair da tela com alterações não salvas pede
confirmação.

## 10. Requisitos não funcionais

- Interface em português brasileiro; datas como `DD/MM/AAAA` e durações como
  `m:ss` ou `h:mm:ss`. O armazenamento é em ISO.
- Desktop primeiro, com layout que se adapta ao celular sem quebrar.
- Acessibilidade básica: labels, navegação por teclado e contraste adequado.
- Estados de carregamento e proteção contra clique duplo.
- Mensagens de erro compreensíveis.
- Sem autenticação: o serviço roda na rede do home lab. Quem estiver na
  rede consegue editar e substituir POPs.
- Variáveis de ambiente: `PORT`, `DATABASE_PATH`, `POPS_DIR`, `AGENDA_FILE`. Há um
  `.env.example` com as quatro.
- Não versionar o banco, a pasta `data/`, segredos nem arquivos `.env`.

## 11. Estrutura e deploy

```text
lugom-limpezas/
├── client/                 # React + Vite
├── server/
│   ├── src/
│   └── migrations/
├── pops/                   # POPs iniciais (semente), versionados
│   ├── escritorio.toon
│   └── banheiro-escritorio.toon
├── data/                   # ignorada pelo git: banco e POPs em uso
├── deploy/
│   ├── lugom-limpezas.service
│   ├── install.sh          # roda uma vez, com sudo
│   └── deploy.sh           # roda a cada atualização, sem sudo
├── .env.example
├── CONTEXT.md
├── README.md
└── project.md
```

**Servidor:** a máquina do home lab, com Ubuntu 24.04. O clone fica em
`~/dev/homelab/lugom/limpezas/`, e o link entra no dashboard (Homarr).

- **Node:** o servidor tem o Node 18 do sistema, que não pode ser alterado e
  não tem `node:sqlite`. O deploy baixa o binário oficial do Node 24 para
  dentro da pasta do app (ignorado pelo git), e o serviço usa esse binário.
- **Dados:** `POPS_DIR=data/pops` e `DATABASE_PATH=data/lugom.db`. Na
  inicialização, se `data/pops/` estiver vazia, o servidor copia os POPs de
  `pops/` para lá. Um `git pull` nunca toca em `data/`.
- **Serviço:** `lugom-limpezas.service` (unidade do sistema) roda como o
  usuário dono do clone, com `Restart=always`, sobe com a máquina e escuta na
  porta `10061`, em todas as interfaces.
- **`install.sh` (uma vez, com sudo):** instala a unidade systemd, habilita o
  serviço e cria uma regra em `sudoers.d` que permite ao usuário rodar só
  `systemctl restart lugom-limpezas` e `systemctl status lugom-limpezas` sem
  senha.
- **`deploy.sh` (sem sudo):** roda `git pull`, garante o Node 24, instala as
  dependências, gera o build, reinicia o serviço e confere que
  `GET /api/environments` responde. Se a verificação falhar, o script
  termina com erro e mostra o log do serviço.

## 12. Testes

Testes de integração da API com Vitest e supertest, sobre um SQLite em
memória e uma pasta de POPs temporária:

- iniciar uma limpeza;
- iniciar com outra em andamento devolve `409` sem a confirmação e, com ela,
  abandona a anterior;
- a volta desconta o tempo em pausa;
- desmarcar apaga a volta;
- o recorde é a menor volta de outras limpezas;
- marcar a última atividade conclui a limpeza com o tempo total certo;
- um arquivo TOON inválido não derruba os outros ambientes;
- salvar um POP inválido devolve `400` e não altera o arquivo;
- importar um ambiente existente devolve `409` sem `replace` e o substitui
  com ele;
- importar com nome de arquivo inválido (por exemplo `../x.toon`) é recusado;
- exportar devolve o arquivo exatamente como foi gravado.

No frontend: o cálculo da atividade atual e da próxima.

## 13. Critérios de aceite

- [ ] A tela inicial lista os ambientes a partir da pasta de POPs.
- [ ] Editar um arquivo TOON aparece ao recarregar, sem reiniciar o serviço.
- [ ] Um arquivo TOON inválido mostra o erro só naquele ambiente.
- [ ] Iniciar limpeza é um clique e o cronômetro começa.
- [ ] A tela da limpeza mostra o cronômetro, a etapa atual, a atividade
  atual com o recorde, a próxima atividade e a lista completa.
- [ ] Pausar suspende o cronômetro e o tempo pausado não entra nas voltas.
- [ ] Cada atividade marcada grava a volta e mostra −/+ em verde ou vermelho
  contra o recorde.
- [ ] Marcar a última atividade conclui a limpeza e mostra o resultado.
- [ ] Iniciar com uma em andamento pede confirmação e abandona a anterior.
- [ ] O histórico mostra data, tempo, status e progresso.
- [ ] Na tela de resultado é possível dar uma nota de 1 a 10 e anotar pontos a
  melhorar; a nota aparece no histórico.
- [ ] O estado sobrevive a recarregar a página.
- [ ] É possível editar um POP pela interface; a edição é gravada no
  arquivo e aparece na próxima limpeza.
- [ ] Um POP inválido não é gravado e o erro aparece na tela.
- [ ] É possível importar um `.toon`, com confirmação antes de substituir.
- [ ] **Baixar .toon** entrega o arquivo com as edições feitas.
- [ ] O serviço systemd sobe com a máquina, reinicia sozinho se cair e
  responde na porta `10061`.
- [ ] `deploy.sh` atualiza o app sem tocar em `data/` e termina com erro se o
  serviço não responder.
- [ ] O README explica como rodar localmente, como instalar e atualizar no
  servidor e como editar os POPs.

## 14. Fora do escopo

- Login, múltiplos usuários e permissões.
- Editor de POP em formulário (inserir, mover, remover com botões); por
  enquanto a edição é no texto TOON.
- Histórico de versões dos POPs.
- Agendamento e notificações.
- Tela de detalhes de limpezas antigas e relatórios.
- Fidelidade do histórico a versões antigas do POP.

## 15. Painel e agenda

A tela inicial é um painel:

- **Hoje:** as limpezas sugeridas para o dia da semana, cada uma levando ao
  ambiente, com o selo *Concluída hoje* ou *Em andamento* quando for o caso.
  Sem sugestões, mostra *Dia livre*.
- **Semana:** os sete dias, de domingo a sábado, com o que está planejado em
  cada um e um ✓ nas limpezas concluídas naquele dia. Hoje fica destacado.
- **Últimas limpezas:** as 10 mais recentes de todos os ambientes, com dia da
  semana, data, ambiente, status e tempo.

O dia de hoje vem do navegador, para não depender do fuso do servidor.

### Agenda

Um arquivo TOON (`AGENDA_FILE`, padrão `data/agenda.toon`), relido a cada
requisição, com um ambiente (nome do arquivo, sem `.toon`) ou mais por dia:

```toon
domingo[0]:
segunda[1]: quarto
terca[1]: escritorio
quarta[1]: quarto
quinta[1]: escritorio
sexta[1]: quarto
sabado[2]: escritorio,banheiro-escritorio
```

- As chaves são `domingo`, `segunda`, `terca`, `quarta`, `quinta`, `sexta` e
  `sabado`, sem acento. Chave desconhecida (por exemplo `terça`) é erro. Dia
  ausente é um dia sem sugestões.
- A agenda inicial (arquivo `agenda.toon` na raiz) é: segunda, quarta e sexta o
  quarto; terça e quinta o escritório; sábado a limpeza geral (escritório e
  banheiro do escritório); domingo livre. Ela é copiada para `AGENDA_FILE` só se
  o arquivo ainda não existir.
- Sem o arquivo, a agenda é vazia. Arquivo inválido mostra o erro no painel
  (`Agenda inválida: …`), sem derrubar o resto.
- A agenda é editada pela interface (**Editar agenda**, a mesma caixa de texto
  dos POPs) com validação e gravação atômica.
- O ambiente da agenda que não existir mais aparece como *ambiente não
  encontrado* no painel.
- O POP inicial `pops/quarto.toon` entra junto, com três etapas simples.
