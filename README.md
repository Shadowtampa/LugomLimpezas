# Lugom Limpezas

Guia de limpeza dos ambientes da casa, no estilo de uma corrida: cronômetro, uma
volta por atividade e comparação com o seu recorde. Detalhes do produto em
[project.md](project.md); vocabulário em [CONTEXT.md](CONTEXT.md).

## Desenvolvimento local

Precisa de Node 24 ou mais novo (o app usa `node:sqlite` e roda TypeScript direto).

```bash
npm install
cp .env.example .env     # opcional; os valores padrão já funcionam
npm run dev              # servidor em :10061 e Vite em :5173 (com proxy para /api)
npm test                 # testes do servidor e do cliente
npm run typecheck
```

Na primeira execução, os POPs de `pops/` são copiados para `data/pops/`. O banco
fica em `data/lugom.db`. A pasta `data/` não é versionada.

Variáveis (`.env`): `PORT` (10061), `DATABASE_PATH` (`data/lugom.db`),
`POPS_DIR` (`data/pops`), `AGENDA_FILE` (`data/agenda.toon`).

## Servidor (systemd)

O app roda como o serviço `lugom-limpezas`, na porta 10061, a partir do clone.
Ele traz o próprio Node 24 em `.node/`, então o Node do sistema não é alterado.

**Instalar (uma vez):**

```bash
git clone https://github.com/Shadowtampa/LugomLimpezas.git ~/dev/homelab/lugom/limpezas
cd ~/dev/homelab/lugom/limpezas
sudo deploy/install.sh
```

O `install.sh` prepara o app, instala a unidade systemd, habilita o serviço e
libera, sem senha, apenas `systemctl restart` e `systemctl status` dele.

**Atualizar (sempre que houver mudança):**

```bash
cd ~/dev/homelab/lugom/limpezas
deploy/deploy.sh
```

O `deploy.sh` faz `git pull`, garante o Node 24, instala as dependências, gera o
build, reinicia o serviço e confere que `GET /api/environments` responde. Se não
responder, termina com erro e mostra o log do serviço. Pode rodar quantas vezes
quiser; nunca toca em `data/`.

## Formato dos POPs (TOON)

Cada arquivo `<slug>.toon` na pasta de POPs é um ambiente. O nome do arquivo é o
endereço, e `ambiente` é o nome exibido.

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

- `ambiente` e `etapas` (pelo menos uma) são obrigatórios; cada etapa tem
  `titulo`, `objetivo`, `atividades` (pelo menos uma) e `aviso` opcional.
- Uma atividade é um texto simples ou um objeto com `texto` e `descricao`
  (opcional); os dois formatos podem se misturar. A descrição aparece na
  atividade atual e na lista, e editá-la não zera o recorde.
- O texto de uma atividade não pode se repetir no arquivo: é ele que a identifica.
  Editar o texto cria uma atividade nova, com recorde zerado.
- Os contadores `[N]` não são exigidos.
- Os arquivos são lidos a cada requisição: editar e recarregar a página basta.
  Um arquivo inválido só quebra o próprio ambiente.

## Agenda da semana (TOON)

O painel da tela inicial sugere as limpezas do dia a partir de `data/agenda.toon`
(a versão inicial vem de `agenda.toon` na raiz do repositório). Edite pela
interface (**Editar agenda**) ou no arquivo; é relido a cada requisição.

```toon
domingo[0]:
segunda[1]: quarto
terca[1]: escritorio
quarta[1]: quarto
quinta[1]: escritorio
sexta[1]: quarto
sabado[2]: escritorio,banheiro-escritorio
```

Chaves: `domingo`, `segunda`, `terca`, `quarta`, `quinta`, `sexta`, `sabado` (sem
acento; chave desconhecida é erro). Os valores são nomes de arquivo de ambiente,
sem `.toon`.
