import { useEffect, useState } from 'react';
import { api, type EnvironmentView } from './api.ts';
import { formatDate, formatDayMonth, formatDuration } from './format.ts';

const STATUS = { in_progress: '▶ Em andamento', completed: '✓ Concluída', abandoned: '✕ Abandonada' } as const;

export function Environment({ slug }: { slug: string }) {
  const [env, setEnv] = useState<EnvironmentView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api<EnvironmentView>(`/environments/${slug}`).then(setEnv, (e: Error) => setError(e.message));
  }, [slug]);

  async function start(abandonCurrent: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>(`/environments/${slug}/cleanings`, { method: 'POST', body: { abandonCurrent } });
      location.hash = `#/l/${id}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const cur = env?.inProgress;

  return (
    <>
      <p><a href="#/">← Ambientes</a></p>
      {error && <p role="alert" className="erro">{error}</p>}
      {!env && !error && <p aria-busy="true">Carregando…</p>}
      {env && (
        <>
          <h1>{env.name}</h1>
          <p className="mais-rapida">
            Limpeza mais rápida: {env.fastestMs !== null ? <strong>{formatDuration(env.fastestMs)}</strong> : 'ainda não há'}
          </p>

          {confirming && cur ? (
            <div className="card confirmacao" role="alertdialog" aria-labelledby="confirma-txt">
              <p id="confirma-txt">
                A limpeza de {formatDayMonth(cur.startedAt)} ({cur.done}/{cur.total}) será marcada como abandonada. Continuar?
              </p>
              <div className="acoes">
                <button className="botao primario" onClick={() => start(true)} disabled={busy} autoFocus>Continuar</button>
                <button className="botao" onClick={() => setConfirming(false)} disabled={busy}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="acoes">
              {cur && (
                <a className="botao primario" href={`#/l/${cur.id}`}>Continuar limpeza ({cur.done}/{cur.total})</a>
              )}
              <button
                className={cur ? 'botao' : 'botao primario'}
                onClick={() => (cur ? setConfirming(true) : start(false))}
                disabled={busy}
              >
                Iniciar limpeza
              </button>
            </div>
          )}
          <h2 id="historico">Histórico</h2>
          {env.history.length === 0 ? (
            <p>Nenhuma limpeza ainda.</p>
          ) : (
            <ul className="historico" aria-labelledby="historico">
              {env.history.map((h) => (
                <li key={h.id} className={`status-${h.status}`}>
                  <span className="data">{formatDate(h.startedAt)}</span>
                  <span className="status">{STATUS[h.status]}</span>
                  <span className="tempo-hist">{formatDuration(h.totalMs)}</span>
                  <span className="prog">{h.done}/{h.total}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="acoes">
            <a className="botao" href={`#/a/${slug}/editar`}>Editar POP</a>
            <a className="botao" href={`/api/environments/${slug}/pop.toon`} download>Baixar .toon</a>
          </div>
        </>
      )}
    </>
  );
}
