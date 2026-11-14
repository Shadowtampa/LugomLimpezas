import { useEffect, useState } from 'react';
import { api, type CleaningView } from './api.ts';
import { currentAndNext, currentEtapaIndex } from './progress.ts';

export function Cleaning({ id }: { id: string }) {
  const [c, setC] = useState<CleaningView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<CleaningView>(`/cleanings/${id}`).then(setC, (e: Error) => setError(e.message));
  }, [id]);

  // A marcação só aparece depois que a API confirma; o clique duplo é ignorado enquanto espera.
  async function mark(task: string, done: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setC(await api<CleaningView>(`/cleanings/${id}/tasks`, { method: 'PUT', body: { task, done } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!c) {
    return error ? <p role="alert" className="erro">{error}</p> : <p aria-busy="true">Carregando…</p>;
  }
  const { current, next } = currentAndNext(c.etapas);
  const etapa = c.etapas[currentEtapaIndex(c.etapas)];
  const locked = c.status === 'abandoned';

  return (
    <>
      <p><a href={`#/a/${c.environment}`}>← {c.environmentName}</a></p>
      <h1>{c.environmentName}</h1>
      <p className="progresso" aria-label="Progresso">{c.progress.done}/{c.progress.total}</p>
      {error && <p role="alert" className="erro">{error}</p>}

      <section className="card etapa" aria-label="Etapa atual">
        <h2>{etapa.titulo}</h2>
        <p>{etapa.objetivo}</p>
        {etapa.aviso && <p className="aviso"><strong>Aviso:</strong> {etapa.aviso}</p>}
      </section>

      {current && (
        <section className="card atual" aria-label="Atividade atual">
          <h2>Agora</h2>
          <p className="atividade-atual">{current}</p>
          <button className="botao primario" onClick={() => mark(current, true)} disabled={busy || locked}>Feito</button>
          {next && <p className="proxima"><span>Próxima:</span> {next}</p>}
        </section>
      )}

      <section aria-label="Lista completa">
        {c.etapas.map((e) => (
          <div key={e.titulo} className="grupo">
            <h3>{e.titulo}</h3>
            <ul className="atividades">
              {e.atividades.map((a) => (
                <li key={a.text}>
                  <label className={a.done ? 'feita' : ''}>
                    <input type="checkbox" checked={a.done} disabled={busy || locked} onChange={() => mark(a.text, !a.done)} />
                    <span>{a.text}</span>
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
