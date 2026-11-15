import { useEffect, useState } from 'react';
import { api, type PopView } from './api.ts';

// Mostra o POP como a limpeza o mostra (etapas, avisos, atividades), só para leitura.
export function PopPreview({ pop }: { pop: PopView }) {
  const total = pop.etapas.reduce((n, e) => n + e.atividades.length, 0);
  return (
    <section aria-label="Pré-visualização">
      <h2>{pop.ambiente} · {total} atividades</h2>
      {pop.etapas.map((e, i) => (
        <div key={i} className="grupo">
          <div className="card etapa">
            <h3>{i + 1}. {e.titulo}</h3>
            <p>{e.objetivo}</p>
            {e.aviso && <p className="aviso"><strong>Aviso:</strong> {e.aviso}</p>}
          </div>
          <ol className="previa-atividades">
            {e.atividades.map((a) => (
              <li key={a.texto}>
                {a.texto}
                {a.descricao && <small className="descricao">{a.descricao}</small>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

export function Previa({ slug }: { slug: string }) {
  const [pop, setPop] = useState<PopView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<PopView>(`/environments/${slug}/pop`).then(setPop, (e: Error) => setError(e.message)); }, [slug]);
  return (
    <>
      <p><a href={`#/a/${slug}`}>← Voltar ao ambiente</a></p>
      <h1>Pré-visualização</h1>
      <p className="muted">Assim o POP aparece numa limpeza. Nada é iniciado nem gravado.</p>
      {error && <p role="alert" className="erro">{error}</p>}
      {!pop && !error && <p aria-busy="true">Carregando…</p>}
      {pop && <PopPreview pop={pop} />}
    </>
  );
}
