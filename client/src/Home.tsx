import { useEffect, useState } from 'react';
import { api, ApiError, type EnvironmentItem } from './api.ts';
import { Dashboard } from './Dashboard.tsx';

type Pending = { filename: string; toon: string; name: string };

export function Home() {
  const [envs, setEnvs] = useState<EnvironmentItem[] | null>(null);
  const [error, setError] = useState('');
  const [importError, setImportError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api<EnvironmentItem[]>('/environments').then(setEnvs, (e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function send(filename: string, toon: string, replace: boolean) {
    if (busy) return;
    setBusy(true);
    setImportError('');
    try {
      await api('/environments/import', { method: 'POST', body: { filename, toon, replace } });
      setPending(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setPending({ filename, toon, name: (e.body as { name: string }).name });
      } else {
        const line = e instanceof ApiError ? (e.body as { problem?: { line?: number } })?.problem?.line : undefined;
        setImportError(`${line ? `Linha ${line}: ` : ''}${(e as Error).message}`);
        setPending(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    send(file.name, await file.text(), false);
  }

  return (
    <>
      <header className="hero">
        <img src="/logo.webp" alt="" width="112" height="112" />
        <h1>Lugom Limpezas</h1>
      </header>
      <Dashboard envs={envs} />
      <h2 id="ambientes">Ambientes</h2>
      {error && <p role="alert" className="erro">{error}</p>}
      {!envs && !error && <p aria-busy="true">Carregando…</p>}
      {envs && envs.length === 0 && <p>Nenhum ambiente. Importe um arquivo .toon ou coloque-o na pasta de POPs.</p>}
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
                  <a href={`#/a/${e.slug}/editar`}>Editar POP</a>
                </>
              ) : (
                <a className="card-link" href={`#/a/${e.slug}`}>{e.name}</a>
              )}
            </li>
          ))}
        </ul>
      )}

      {pending ? (
        <div className="card confirmacao" role="alertdialog" aria-labelledby="substitui-txt">
          <p id="substitui-txt">Substituir o POP de {pending.name}?</p>
          <div className="acoes">
            <button className="botao primario" onClick={() => send(pending.filename, pending.toon, true)} disabled={busy} autoFocus>Substituir</button>
            <button className="botao" onClick={() => setPending(null)} disabled={busy}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="acoes">
          <label className={`botao${busy ? ' desabilitado' : ''}`}>
            Importar .toon
            <input
              type="file"
              accept=".toon"
              className="so-leitor-de-tela"
              disabled={busy}
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
            />
          </label>
        </div>
      )}
      {importError && <p role="alert" className="erro">{importError}</p>}
    </>
  );
}
