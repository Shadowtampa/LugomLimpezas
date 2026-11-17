import { useEffect, useState } from 'react';
import { api, type DashboardView, type EnvironmentItem } from './api.ts';
import { allDrafts } from './draft.ts';
import { formatDate, formatDuration } from './format.ts';
import { completedOn, DAY_LONG, DAY_SHORT, weekOf } from './week.ts';

const STATUS = { in_progress: '▶ Em andamento', completed: '✓ Concluída', abandoned: '✕ Abandonada' } as const;

export function Dashboard({ envs }: { envs: EnvironmentItem[] | null }) {
  const [d, setD] = useState<DashboardView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<DashboardView>('/dashboard').then(setD, (e: Error) => setError(e.message)); }, []);

  if (error) return <p role="alert" className="erro">{error}</p>;
  if (!d) return <p aria-busy="true">Carregando…</p>;

  const names = new Map((envs ?? []).flatMap((e) => (e.name ? [[e.slug, e.name] as const] : [])));
  const nameOf = (slug: string) => names.get(slug) ?? slug;
  const week = weekOf(new Date());
  const today = week.find((w) => w.isToday)!;
  const doneToday = completedOn(d.recent, today.day);
  const running = new Set(allDrafts().map((x) => x.ambiente)); // em andamento = rascunho neste aparelho
  const planned = d.agenda[today.key];

  return (
    <>
      <section className="card hoje" aria-labelledby="hoje">
        <h2 id="hoje">Hoje · {DAY_LONG[today.index]}, {String(today.date.getDate()).padStart(2, '0')}/{String(today.date.getMonth() + 1).padStart(2, '0')}</h2>
        {d.agendaError && (
          <p role="alert" className="erro">
            Agenda inválida: {d.agendaError.line ? `linha ${d.agendaError.line}: ` : ''}{d.agendaError.message}
          </p>
        )}
        {planned.length === 0 ? (
          <p className="muted">Dia livre: nenhuma limpeza sugerida.</p>
        ) : (
          <ul className="sugestoes">
            {planned.map((slug) => (
              <li key={slug}>
                {names.has(slug) ? <a href={`#/a/${slug}`}>{nameOf(slug)}</a> : <span>{slug} <small className="muted">(ambiente não encontrado)</small></span>}
                {doneToday.has(slug) && <span className="selo feita">✓ Concluída hoje</span>}
                {!doneToday.has(slug) && running.has(slug) && <span className="selo andamento">▶ Em andamento</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="rodape"><a href="#/agenda/editar">Editar agenda</a></p>
      </section>

      <section aria-labelledby="semana">
        <h2 id="semana">Semana</h2>
        <ol className="semana">
          {week.map((w) => {
            const done = completedOn(d.recent, w.day);
            return (
              <li key={w.key} className={w.isToday ? 'dia hoje-dia' : 'dia'} aria-current={w.isToday ? 'date' : undefined}>
                <span className="dia-nome">{DAY_SHORT[w.index]} <span className="dia-num">{w.date.getDate()}</span></span>
                <ul>
                  {d.agenda[w.key].length === 0 && <li className="muted">livre</li>}
                  {d.agenda[w.key].map((slug) => (
                    <li key={slug}>{done.has(slug) ? '✓ ' : ''}{nameOf(slug)}</li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="ultimas">
        <h2 id="ultimas">Últimas limpezas</h2>
        {d.recent.length === 0 ? (
          <p className="muted">Nenhuma limpeza ainda.</p>
        ) : (
          <ul className="historico recentes">
            {d.recent.slice(0, 10).map((r) => {
              const dt = new Date(r.startedAt);
              return (
                <li key={r.id} className={`status-${r.status}`}>
                  <span className="data"><strong>{DAY_SHORT[dt.getDay()]}</strong> <a href={`#/l/${r.id}`}>{formatDate(r.startedAt)}</a></span>
                  <span className="ambiente-nome"><a href={`#/a/${r.environment}`}>{r.environmentName}</a> <span className="status">{STATUS[r.status as keyof typeof STATUS]}</span></span>
                  <span className="tempo-hist">{formatDuration(r.totalMs)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
