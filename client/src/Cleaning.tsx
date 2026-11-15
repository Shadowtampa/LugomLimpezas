import { useEffect, useState } from 'react';
import { api, type CleaningView, type PopView } from './api.ts';
import { deltaClass, formatDelta, formatDuration } from './format.ts';
import { currentAndNext, currentEtapaIndex, previewView, togglePreview } from './progress.ts';

// O servidor manda o tempo ativo; o navegador só soma o que passou desde que recebeu.
function useNow(running: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [running]);
  return now;
}

// R10: nota de 1 a 10 e pontos a melhorar; o servidor só aceita em limpeza concluída.
function Avaliacao({ review, busy, onSave }: { review: CleaningView['review']; busy: boolean; onSave: (score: number, improvements: string) => void }) {
  const [score, setScore] = useState(review?.score ?? 0);
  const [text, setText] = useState(review?.improvements ?? '');
  const saved = !!review && review.score === score && review.improvements === text.trim();
  return (
    <form className="avaliacao" onSubmit={(e) => { e.preventDefault(); onSave(score, text); }}>
      <h3>Como foi esta limpeza?</h3>
      <div role="radiogroup" aria-label="Nota de 1 a 10" className="notas">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={score === n} className={`nota${score === n ? ' sel' : ''}`} onClick={() => setScore(n)}>{n}</button>
        ))}
      </div>
      <label htmlFor="melhorar">O que eu poderia melhorar?</label>
      <textarea id="melhorar" className="melhorar" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="botao primario" disabled={busy || score === 0 || saved}>{saved ? 'Avaliação salva ✓' : 'Salvar avaliação'}</button>
    </form>
  );
}

// Com `pop`, é a pré-visualização (R12): a mesma tela, mas local, sem cronômetro e sem gravar.
export function Cleaning({ id, pop }: { id?: string; pop?: PopView }) {
  const [c, setC] = useState<CleaningView | null>(pop ? previewView(pop) : null);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const now = useNow(!!c?.running);

  function apply(view: CleaningView) {
    setReceivedAt(Date.now());
    setC(view);
  }

  useEffect(() => {
    if (!id) return;
    api<CleaningView>(`/cleanings/${id}`).then(apply, (e: Error) => setError(e.message));
  }, [id]);

  // O estado só muda depois que a API confirma; o clique duplo é ignorado enquanto espera.
  async function call(path: string, method: string, body?: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      apply(await api<CleaningView>(`/cleanings/${id}${path}`, { method, body }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const mark = (task: string, done: boolean) => (pop ? setC((v) => togglePreview(v!, task, done)) : call('/tasks', 'PUT', { task, done }));

  if (!c) {
    return error ? <p role="alert" className="erro">{error}</p> : <p aria-busy="true">Carregando…</p>;
  }
  const { current, next } = currentAndNext(c.etapas);
  const currentAct = c.etapas.flatMap((e) => e.atividades).find((a) => a.text === current);
  const etapa = c.etapas[currentEtapaIndex(c.etapas)];
  const locked = c.status === 'abandoned';
  const elapsed = c.activeMs + (c.running ? now - receivedAt : 0);

  return (
    <>
      {!pop && <p><a href={`#/a/${c.environment}`}>← {c.environmentName}</a></p>}
      {pop ? <h2>{c.environmentName}</h2> : <h1>{c.environmentName}</h1>}

      {pop ? (
        <div className="card previa-faixa" role="status">
          <p><strong>Pré-visualização:</strong> o tempo não corre e nada é gravado.</p>
          <button className="botao" onClick={() => setC(previewView(pop))}>Recomeçar prévia</button>
        </div>
      ) : (
      <div className="cronometro">
        <span className="tempo" role="timer" aria-label="Tempo ativo">{formatDuration(elapsed)}</span>
        {c.status === 'in_progress' && (
          <button className="botao" onClick={() => call(c.running ? '/pause' : '/resume', 'POST')} disabled={busy}>
            {c.running ? 'Pausar' : 'Continuar'}
          </button>
        )}
        {c.status === 'in_progress' && !c.running && <span className="pausado">Pausado</span>}
      </div>
      )}
      <p className="progresso" aria-label="Progresso">{c.progress.done}/{c.progress.total}</p>
      {error && <p role="alert" className="erro">{error}</p>}
      {locked && <p className="aviso">Limpeza abandonada: só para consulta.</p>}

      {c.result && (
        <section className="card resultado" aria-label="Resultado">
          <h2>Limpeza concluída</h2>
          <p className="tempo-total">{formatDuration(c.result.totalMs)}</p>
          {c.result.newRecord ? (
            <p className="novo-recorde">Novo recorde!</p>
          ) : (
            <p>
              <span className={`delta ${deltaClass(c.result.diffMs!)}`}>{formatDelta(c.result.diffMs!)}</span>
              {" "}em relação à mais rápida ({formatDuration(c.result.fastestOtherMs!)})
            </p>
          )}
          {c.result.brokenRecords.length > 0 && (
            <>
              <h3>Recordes batidos</h3>
              <ul className="recordes-batidos">
                {c.result.brokenRecords.map((r) => (
                  <li key={r.text}>
                    {r.text} <span className="delta melhor">{formatDelta(r.lapMs - r.recordMs)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Avaliacao review={c.review} busy={busy} onSave={(score, improvements) => call('/review', 'PUT', { score, improvements })} />
          <a className="botao" href={`#/a/${c.environment}`}>Voltar ao ambiente</a>
          <p className="dica">Desmarcar uma atividade na lista abaixo reabre a limpeza, pausada.</p>
        </section>
      )}

      {!c.result && (
      <section className="card etapa" aria-label="Etapa atual">
        <h2>{etapa.titulo}</h2>
        <p>{etapa.objetivo}</p>
        {etapa.aviso && <p className="aviso"><strong>Aviso:</strong> {etapa.aviso}</p>}
      </section>

      )}

      {pop && !current && <p className="card" role="status">Fim da pré-visualização: todas as atividades foram marcadas.</p>}

      {current && !c.result && (
        <section className="card atual" aria-label="Atividade atual">
          <h2>Agora</h2>
          <p className="atividade-atual">{current}</p>
          {currentAct?.descricao && <p className="descricao-atual">{currentAct.descricao}</p>}
          <p className="recorde">{currentAct?.recordMs !== undefined ? `Recorde: ${formatDuration(currentAct.recordMs)}` : "Sem recorde ainda"}</p>
          <button className="botao primario" onClick={() => mark(current, true)} disabled={busy || locked}>Feito</button>
          {next && <p className="proxima"><span>Próxima:</span> {next}</p>}
        </section>
      )}

      {!pop && c.status === 'in_progress' && (confirming ? (
        <div className="card confirmacao" role="alertdialog" aria-labelledby="abandona-txt">
          <p id="abandona-txt">A limpeza ({c.progress.done}/{c.progress.total}) será marcada como abandonada e não aceitará mais marcações. Continuar?</p>
          <div className="acoes">
            <button className="botao primario" onClick={async () => { await call('/abandon', 'POST'); setConfirming(false); }} disabled={busy} autoFocus>Abandonar</button>
            <button className="botao" onClick={() => setConfirming(false)} disabled={busy}>Cancelar</button>
          </div>
        </div>
      ) : (
        <p><button className="botao" onClick={() => setConfirming(true)} disabled={busy}>Abandonar limpeza</button></p>
      ))}

      <section aria-label="Lista completa">
        {c.etapas.map((e) => (
          <div key={e.titulo} className="grupo">
            <h3>{e.titulo}</h3>
            <ul className="atividades">
              {e.atividades.map((a) => (
                <li key={a.text}>
                  <label className={a.done ? 'feita' : ''}>
                    <input type="checkbox" checked={a.done} disabled={busy || locked} onChange={() => mark(a.text, !a.done)} />
                    <span className="texto">
                      <span className="t">{a.text}</span>
                      {a.descricao && <small className="descricao">{a.descricao}</small>}
                    </span>
                    {a.done && a.lapMs !== undefined && <span className="volta">{formatDuration(a.lapMs)}</span>}
                    {a.done && a.deltaMs !== undefined && <span className={`delta ${deltaClass(a.deltaMs)}`}>{formatDelta(a.deltaMs)}</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
