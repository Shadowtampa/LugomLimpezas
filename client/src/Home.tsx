import { useEffect, useState } from 'react';
import { api, type EnvironmentItem } from './api.ts';
import { Dashboard } from './Dashboard.tsx';

export function Home() {
  const [envs, setEnvs] = useState<EnvironmentItem[] | null>(null);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');

  useEffect(() => { api<EnvironmentItem[]>('/environments').then(setEnvs, (e: Error) => setError(e.message)); }, []);

  // Ambiente novo: só o nome; os POPs são criados ou importados dentro dele.
  async function create(ev: React.FormEvent) {
    ev.preventDefault();
    setCreateError('');
    try {
      const r = await api<{ slug: string }>('/environments', { method: 'POST', body: { name: newName } });
      location.hash = `#/a/${r.slug}`;
    } catch (e) { setCreateError((e as Error).message); }
  }

  return (
    <div className="home">
      <header className="hero">
        <img src="/logo.webp" alt="" width="112" height="112" />
        <h1>Lugom Limpezas</h1>
      </header>
      <Dashboard envs={envs} />
      <h2 id="ambientes">Ambientes</h2>
      {error && <p role="alert" className="erro">{error}</p>}
      {!envs && !error && <p aria-busy="true">Carregando…</p>}
      {envs && envs.length === 0 && <p>Nenhum ambiente. Crie um abaixo.</p>}
      {envs && (
        <ul className="lista" aria-labelledby="ambientes">
          {envs.map((e) => {
            const broken = e.pops.filter((p) => p.error).length;
            return (
              <li key={e.slug} className={broken ? 'card invalido' : 'card'}>
                <a className="card-link" href={`#/a/${e.slug}`}>{e.name}</a>
                {e.pops.length !== 1 && <small className="muted">{e.pops.length} POPs</small>}
                {broken > 0 && <p role="alert" className="erro">{broken === 1 ? '1 POP inválido' : `${broken} POPs inválidos`}: abra o ambiente para corrigir.</p>}
              </li>
            );
          })}
        </ul>
      )}

      <form className="nota-form" onSubmit={create}>
        <label htmlFor="novo-ambiente" className="muted">Novo ambiente (ex.: Quarto)</label>
        <input id="novo-ambiente" className="campo" value={newName} maxLength={100} onChange={(e) => setNewName(e.target.value)} />
        <button className="botao" disabled={!newName.trim()}>Criar ambiente</button>
      </form>
      {createError && <p role="alert" className="erro">{createError}</p>}
    </div>
  );
}
