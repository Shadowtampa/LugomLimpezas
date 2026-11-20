import { Cleaning } from './Cleaning.tsx';
import { Editor } from './Editor.tsx';
import { Environment } from './Environment.tsx';
import { Home } from './Home.tsx';
import { Previa } from './PopPreview.tsx';
import { useHash } from './useHash.ts';

export function App() {
  const hash = useHash();
  const agenda = hash === '#/agenda/editar';
  const edit = /^#\/a\/([a-z0-9-]+)\/p\/([a-z0-9-]+)\/editar$/.exec(hash);
  const preview = /^#\/a\/([a-z0-9-]+)\/p\/([a-z0-9-]+)\/previa$/.exec(hash);
  const env = /^#\/a\/([a-z0-9-]+)(?:\/p\/([a-z0-9-]+))?$/.exec(hash);
  const cleaning = /^#\/l\/([\w-]+)$/.exec(hash);
  return (
    <main>
      {agenda ? (
        <Editor
          title="Editar agenda"
          filename="agenda.toon"
          fileUrl="/api/agenda.toon"
          saveUrl="/agenda"
          back="#/"
          hint="Uma linha por dia: domingo, segunda, terca, quarta, quinta, sexta, sabado. Exemplo: sabado[2]: escritorio,quarto/rapido. Use o ambiente (qualquer POP) ou ambiente/pop para sugerir um POP."
        />
      ) : edit ? (
        <Editor
          key={edit[0]}
          title="Editar POP"
          filename={`${edit[2]}.toon`}
          fileUrl={`/api/environments/${edit[1]}/pops/${edit[2]}/pop.toon`}
          saveUrl={`/environments/${edit[1]}/pops/${edit[2]}`}
          preview
          back={`#/a/${edit[1]}/p/${edit[2]}`}
          hint="O campo nome é o nome do POP (ex.: Completo, Rápido)." 
        />
      ) : preview ? <Previa key={preview[0]} slug={preview[1]} pop={preview[2]} />
      : env ? <Environment key={env[1]} slug={env[1]} pop={env[2]} />
        : cleaning ? <Cleaning key={cleaning[1]} id={cleaning[1]} />
        : <Home />}
    </main>
  );
}
