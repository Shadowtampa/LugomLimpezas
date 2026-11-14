import { useEffect, useState } from 'react';
import { api, ApiError } from './api.ts';

export function Editor({ slug }: { slug: string }) {
  const [original, setOriginal] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = original !== null && text !== original;

  useEffect(() => {
    fetch(`/api/environments/${slug}/pop.toon`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('Ambiente não encontrado'))))
      .then((t) => { setOriginal(t); setText(t); }, (e: Error) => setError(e.message));
  }, [slug]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  const back = `#/a/${slug}`;
  function leave() {
    if (!dirty || confirm('Há alterações não salvas. Sair mesmo assim?')) location.hash = back;
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/environments/${slug}/pop`, { method: 'PUT', body: { toon: text } });
      setOriginal(text);
      location.hash = back;
    } catch (e) {
      const problem = e instanceof ApiError ? (e.body as { problem?: { line?: number } } | undefined)?.problem : undefined;
      setError(`${problem?.line ? `Linha ${problem.line}: ` : ''}${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <>
      <p><a href={back} onClick={(e) => { e.preventDefault(); leave(); }}>← Voltar</a></p>
      <h1>Editar POP</h1>
      {error && <p role="alert" className="erro">{error}</p>}
      {original === null && !error && <p aria-busy="true">Carregando…</p>}
      {original !== null && (
        <>
          <label htmlFor="toon" className="rotulo">Conteúdo do arquivo {slug}.toon</label>
          <textarea
            id="toon"
            className="editor"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            disabled={busy}
          />
          <div className="acoes">
            <button className="botao primario" onClick={save} disabled={busy || !dirty}>Salvar</button>
            <button className="botao" onClick={leave} disabled={busy}>Cancelar</button>
          </div>
        </>
      )}
    </>
  );
}
