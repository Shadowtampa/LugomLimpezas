import { useEffect, useState } from 'react';
import { api, ApiError, type EnvironmentView } from './api.ts';
import { addEvent, clearDraft, draftDone, draftPop, loadDraft, saveDraft, startDraft } from './draft.ts';
import { formatDate, formatDayMonth, formatDuration } from './format.ts';

const STATUS = { in_progress: '▶ Em andamento', completed: '✓ Concluída', abandoned: '✕ Abandonada' } as const;

// O POP escolhido vive no endereço (#/a/<ambiente>/p/<pop>): voltar do editor ou da prévia mantém a escolha.
export function Environment({ slug, pop: popParam }: { slug: string; pop?: string }) {
  const [env, setEnv] = useState<EnvironmentView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newPop, setNewPop] = useState('');
  const [pendingImport, setPendingImport] = useState<{ filename: string; toon: string; name: string } | null>(null);

  const load = () => api<EnvironmentView>(`/environments/${slug}`).then(setEnv, (e: Error) => setError(e.message));
  useEffect(() => { load(); }, [slug]);
  useEffect(() => { setPrompt(null); }, [popParam]);

  const valid = env?.pops.filter((p) => !p.error) ?? [];
  // Com um POP só, ele já vem escolhido.
  const sel = env?.pops.find((p) => p.slug === popParam) ?? (env?.pops.length === 1 ? env.pops[0] : undefined);
  const choose = (p: string) => location.replace(`#/a/${slug}/p/${p}`);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); }
  }

  // R13: notas soltas do ambiente; vão no prompt da IA (R11).
  async function addNote(ev: React.FormEvent) {
    ev.preventDefault();
    if (!noteText.trim()) return;
    run(async () => { await api(`/environments/${slug}/notes`, { method: 'POST', body: { text: noteText } }); setNoteText(''); await load(); });
  }
  const removeNote = (id: string) => run(async () => { await api(`/environments/${slug}/notes/${id}`, { method: 'DELETE' }); await load(); });

  async function rename(ev: React.FormEvent) {
    ev.preventDefault();
    run(async () => { await api(`/environments/${slug}`, { method: 'PUT', body: { name: renaming } }); setRenaming(null); await load(); });
  }

  // POP novo: o servidor cria um modelo válido e o editor abre para completar.
  async function createPop(ev: React.FormEvent) {
    ev.preventDefault();
    run(async () => {
      const r = await api<{ slug: string }>(`/environments/${slug}/pops`, { method: 'POST', body: { name: newPop } });
      location.hash = `#/a/${slug}/p/${r.slug}/editar`;
    });
  }

  async function importPop(filename: string, toon: string, replace: boolean) {
    setError('');
    try {
      const r = await api<{ slug: string }>(`/environments/${slug}/pops/import`, { method: 'POST', body: { filename, toon, replace } });
      setPendingImport(null);
      await load();
      choose(r.slug);
    } catch (e) {
      setPendingImport(null);
      if (e instanceof ApiError && e.status === 409) setPendingImport({ filename, toon, name: (e.body as { name: string }).name });
      else {
        const line = e instanceof ApiError ? (e.body as { problem?: { line?: number } })?.problem?.line : undefined;
        setError(`${line ? `Linha ${line}: ` : ''}${(e as Error).message}`);
      }
    }
  }

  // R3: só limpeza abandonada pode ser excluída; confirmação nativa, como no editor.
  async function remove(h: EnvironmentView['history'][number]) {
    if (!confirm(`Excluir a limpeza abandonada de ${formatDayMonth(h.startedAt)} (${h.done}/${h.total})? O tempo e as voltas dela serão apagados e não dá para desfazer.`)) return;
    run(async () => { await api(`/cleanings/${h.id}`, { method: 'DELETE' }); await load(); });
  }

  // Iniciar não fala com o servidor: cria o rascunho local. Abandonar o rascunho anterior é o único envio daqui.
  async function start(abandonCurrent: boolean) {
    if (busy || !sel) return;
    setBusy(true);
    try {
      const old = loadDraft(slug);
      if (old && abandonCurrent) {
        await api('/cleanings', { method: 'POST', body: { id: old.id, ambiente: slug, pop: draftPop(old), status: 'abandonada', eventos: addEvent(old, 'abandono').eventos } });
        clearDraft(slug);
      }
      const d = startDraft(slug, sel.slug);
      saveDraft(d);
      location.hash = `#/l/${d.id}`;
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
      const r = await fetch(`/api/environments/${slug}/pops/${sel!.slug}/prompt-ia`);
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

  const draft = loadDraft(slug);
  const draftTotal = env?.pops.find((p) => draft && p.slug === draftPop(draft))?.total ?? 0;
  const cur = env && draft ? { id: draft.id, startedAt: draft.eventos[0].em, done: draftDone(draft), total: draftTotal } : null;
  const popBase = sel ? `#/a/${slug}/p/${sel.slug}` : '';

  return (
    <>
      <p><a href="#/">← Ambientes</a></p>
      {error && <p role="alert" className="erro">{error}</p>}
      {!env && !error && <p aria-busy="true">Carregando…</p>}
      {env && (
        <>
          {renaming === null ? (
            <div className="titulo-ambiente">
              <h1>{env.name}</h1>
              <button className="botao" onClick={() => setRenaming(env.name)}>Renomear</button>
            </div>
          ) : (
            <form className="nota-form" onSubmit={rename}>
              <label htmlFor="nome-ambiente" className="rotulo">Nome do ambiente</label>
              <input id="nome-ambiente" className="campo" value={renaming} maxLength={100} autoFocus onChange={(e) => setRenaming(e.target.value)} />
              <div className="acoes">
                <button className="botao primario" disabled={!renaming.trim()}>Salvar nome</button>
                <button type="button" className="botao" onClick={() => setRenaming(null)}>Cancelar</button>
              </div>
            </form>
          )}

          <fieldset className="pops">
            <legend>POP da limpeza</legend>
            {env.pops.length === 0 && <p className="muted">Nenhum POP ainda. Crie um abaixo ou importe um .toon.</p>}
            {env.pops.map((p) => (
              <label key={p.slug} className={`pop-opcao${p.error ? ' invalido' : ''}`}>
                <input type="radio" name="pop" checked={sel?.slug === p.slug} onChange={() => choose(p.slug)} />
                {p.error ? (
                  <span><strong>{p.slug}.toon</strong> <span className="erro">{p.error.line ? `Linha ${p.error.line}: ` : ''}{p.error.message}</span></span>
                ) : (
                  <span>{p.name} <small className="muted">· {p.total} atividades</small></span>
                )}
              </label>
            ))}
          </fieldset>

          {sel && !sel.error && (
            <p className="mais-rapida">
              Limpeza mais rápida: {sel.fastestMs != null ? <strong>{formatDuration(sel.fastestMs)}</strong> : 'ainda não há'}
            </p>
          )}

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
                disabled={busy || !sel || !!sel.error}
              >
                Iniciar limpeza{sel && !sel.error && valid.length > 1 ? ` (${sel.name})` : ''}
              </button>
              {!sel && env.pops.length > 1 && <span className="muted">Escolha o POP acima.</span>}
            </div>
          )}

          {sel && (
            <div className="acoes">
              {!sel.error && <a className="botao" href={`${popBase}/previa`}>Pré-visualizar</a>}
              <a className="botao" href={`${popBase}/editar`}>Editar POP</a>
              <a className="botao" href={`/api/environments/${slug}/pops/${sel.slug}/pop.toon`} download>Baixar .toon</a>
              <button className="botao" onClick={improve}>Melhorar com IA (processo manual)</button>
            </div>
          )}
          {prompt !== null && sel && (
            <section className="card" aria-label="Prompt para a IA">
              <p>{copied ? 'Prompt copiado.' : 'Selecione o texto e copie (Ctrl+C).'} Cole numa IA, converse até aprovar as mudanças e, quando ela devolver o TOON novo, use <a href={`${popBase}/editar`}>Editar POP</a>: cole no lugar do texto atual e salve.</p>
              <textarea id="prompt-ia" className="editor prompt-ia" readOnly value={prompt} aria-label="Prompt para a IA" />
            </section>
          )}

          <form className="nota-form" onSubmit={createPop}>
            <label htmlFor="novo-pop" className="muted">Novo POP neste ambiente (ex.: Rápido)</label>
            <input id="novo-pop" className="campo" value={newPop} maxLength={100} onChange={(e) => setNewPop(e.target.value)} />
            <div className="acoes">
              <button className="botao" disabled={!newPop.trim()}>Criar POP</button>
              <label className="botao">
                Importar POP (.toon)
                <input
                  type="file"
                  accept=".toon"
                  className="so-leitor-de-tela"
                  onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importPop(f.name, await f.text(), false); }}
                />
              </label>
            </div>
          </form>
          {pendingImport && (
            <div className="card confirmacao" role="alertdialog" aria-labelledby="substitui-txt">
              <p id="substitui-txt">Substituir o POP {pendingImport.name}?</p>
              <div className="acoes">
                <button className="botao primario" onClick={() => importPop(pendingImport.filename, pendingImport.toon, true)} autoFocus>Substituir</button>
                <button className="botao" onClick={() => setPendingImport(null)}>Cancelar</button>
              </div>
            </div>
          )}

          <h2 id="notas">Notas do ambiente</h2>
          <form className="nota-form" onSubmit={addNote}>
            <label htmlFor="nova-nota" className="muted">Uma ideia ou algo a melhorar neste ambiente (vai no prompt da IA)</label>
            <textarea id="nova-nota" className="melhorar" rows={2} maxLength={1000} value={noteText} onChange={(ev) => setNoteText(ev.target.value)} />
            <button className="botao" disabled={!noteText.trim()}>Adicionar nota</button>
          </form>
          {env.notes.length > 0 && (
            <ul className="notas-lista" aria-labelledby="notas">
              {env.notes.map((n) => (
                <li key={n.id}>
                  <span className="data">{formatDate(n.createdAt)}</span>
                  <span className="texto-nota">{n.text}</span>
                  <button className="excluir" onClick={() => removeNote(n.id)} aria-label={`Excluir nota de ${formatDayMonth(n.createdAt)}`}>Excluir</button>
                </li>
              ))}
            </ul>
          )}

          <h2 id="historico">Histórico</h2>
          {env.history.length === 0 ? (
            <p>Nenhuma limpeza ainda.</p>
          ) : (
            <ul className="historico" aria-labelledby="historico">
              {env.history.map((h) => (
                <li key={h.id} className={`status-${h.status}`}>
                  <span className="data"><a href={`#/l/${h.id}`}>{formatDate(h.startedAt)}</a></span>
                  <span className="status">{STATUS[h.status]}{h.score !== null && <span className="nota-hist" aria-label={`nota ${h.score}`}> · ★ {h.score}</span>}{env.pops.length > 1 && <span className="muted"> · {h.popName}</span>}</span>
                  <span className="tempo-hist">{formatDuration(h.totalMs)}</span>
                  <span className="prog">{h.done}/{h.total}</span>
                  {h.status === 'abandoned' && <button className="excluir" onClick={() => remove(h)} aria-label={`Excluir limpeza abandonada de ${formatDayMonth(h.startedAt)}`}>Excluir</button>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
