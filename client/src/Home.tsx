import { useEffect, useState } from 'react';
import { api, type EnvironmentItem } from './api.ts';

export function Home() {
  const [envs, setEnvs] = useState<EnvironmentItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<EnvironmentItem[]>('/environments').then(setEnvs, (e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <h1>Lugom Limpezas</h1>
      <h2 id="ambientes">Ambientes</h2>
      {error && <p role="alert" className="erro">{error}</p>}
      {!envs && !error && <p aria-busy="true">Carregando…</p>}
      {envs && envs.length === 0 && <p>Nenhum ambiente. Coloque um arquivo .toon na pasta de POPs.</p>}
      {envs && (
        <ul className="lista" aria-labelledby="ambientes">
          {envs.map((e) => (
            <li key={e.slug} className={e.error ? 'card invalido' : 'card'}>
              {e.error ? (
                <>
                  <strong>{e.slug}.toon</strong>
                  <p role="alert" className="erro">
                    {e.error.line ? `Linha ${e.error.line}: ` : ''}{e.error.message}
                  </p>
                </>
              ) : (
                <a className="card-link" href={`#/a/${e.slug}`}>{e.name}</a>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
