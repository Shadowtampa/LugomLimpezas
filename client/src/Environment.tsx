import { useEffect, useState } from 'react';
import { api, type EnvironmentView } from './api.ts';
import { formatDate, formatDayMonth, formatDuration } from './format.ts';

const STATUS = { in_progress: '▶ Em andamento', completed: '✓ Concluída', abandoned: '✕ Abandonada' } as const;

export function Environment({ slug }: { slug: string }) {
  const [env, setEnv] = useState<EnvironmentView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  // Processo manual: monta o prompt no servidor e copia. Em http sem HTTPS o clipboard não existe; cai no execCommand.
  async function improve() {
    setError('');
    setCopied(false);
    try {
      const r = await fetch(`/api/environments/${slug}/prompt-ia`);
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Erro ${r.status}`);
      setPrompt(await r.text());
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => {
    if (prompt === null) return;
    const el = document.getElementById('prompt-ia') as HTMLTextAreaElement | null;
    el?.select();
    (navigator.clipboard?.writeText(prompt) ?? Promise.reject(new Error())).then(() => true, () => document.execCommand('copy')).then(setCopied);
  }, [prompt]);

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
                  <span className="data"><a href={`#/l/${h.id}`}>{formatDate(h.startedAt)}</a></span>
                  <span className="status">{STATUS[h.status]}{h.score !== null && <span className="nota-hist" aria-label={`nota ${h.score}`}> · ★ {h.score}</span>}</span>
                  <span className="tempo-hist">{formatDuration(h.totalMs)}</span>
                  <span className="prog">{h.done}/{h.total}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="acoes">
            <a className="botao" href={`#/a/${slug}/previa`}>Pré-visualizar</a>
            <a className="botao" href={`#/a/${slug}/editar`}>Editar POP</a>
            <a className="botao" href={`/api/environments/${slug}/pop.toon`} download>Baixar .toon</a>
            <button className="botao" onClick={improve}>Melhorar com IA (processo manual)</button>
          </div>
          {prompt !== null && (
            <section className="card" aria-label="Prompt para a IA">
              <p>{copied ? 'Prompt copiado.' : 'Selecione o texto e copie (Ctrl+C).'} Cole numa IA, converse até aprovar as mudanças e, quando ela devolver o TOON novo, use <a href={`#/a/${slug}/editar`}>Editar POP</a>: cole no lugar do texto atual e salve.</p>
              <textarea id="prompt-ia" className="editor prompt-ia" readOnly value={prompt} aria-label="Prompt para a IA" />
            </section>
          )}
        </>
      )}
    </>
  );
}
