import { useEffect, useState } from 'react';
import { api, type EnvironmentView } from './api.ts';

export function Environment({ slug }: { slug: string }) {
  const [env, setEnv] = useState<EnvironmentView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<EnvironmentView>(`/environments/${slug}`).then(setEnv, (e: Error) => setError(e.message));
  }, [slug]);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>(`/environments/${slug}/cleanings`, { method: 'POST', body: {} });
      location.hash = `#/l/${id}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <p><a href="#/">← Ambientes</a></p>
      {error && <p role="alert" className="erro">{error}</p>}
      {!env && !error && <p aria-busy="true">Carregando…</p>}
      {env && (
        <>
          <h1>{env.name}</h1>
          <div className="acoes">
            {env.inProgress ? (
              <a className="botao primario" href={`#/l/${env.inProgress.id}`}>
                Continuar limpeza ({env.inProgress.done}/{env.inProgress.total})
              </a>
            ) : (
              <button className="botao primario" onClick={start} disabled={busy}>Iniciar limpeza</button>
            )}
          </div>
        </>
      )}
    </>
  );
}
