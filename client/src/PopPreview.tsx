import { useEffect, useState } from 'react';
import { api, type PopView } from './api.ts';
import { Cleaning } from './Cleaning.tsx';

// A tela de limpeza, mas local: sem cronômetro, sem recorde e sem gravar nada.
export const PopPreview = ({ pop }: { pop: PopView }) => <Cleaning key={JSON.stringify(pop)} pop={pop} />;

export function Previa({ slug }: { slug: string }) {
  const [pop, setPop] = useState<PopView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<PopView>(`/environments/${slug}/pop`).then(setPop, (e: Error) => setError(e.message)); }, [slug]);
  return (
    <>
      <p><a href={`#/a/${slug}`}>← Voltar ao ambiente</a></p>
      {error && <p role="alert" className="erro">{error}</p>}
      {!pop && !error && <p aria-busy="true">Carregando…</p>}
      {pop && <PopPreview pop={pop} />}
    </>
  );
}
