import { Cleaning } from './Cleaning.tsx';
import { Editor } from './Editor.tsx';
import { Environment } from './Environment.tsx';
import { Home } from './Home.tsx';
import { Previa } from './PopPreview.tsx';
import { useHash } from './useHash.ts';

export function App() {
  const hash = useHash();
  const agenda = hash === '#/agenda/editar';
  const edit = /^#\/a\/([a-z0-9-]+)\/editar$/.exec(hash);
  const preview = /^#\/a\/([a-z0-9-]+)\/previa$/.exec(hash);
  const env = /^#\/a\/([a-z0-9-]+)$/.exec(hash);
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
          hint="Uma linha por dia: domingo, segunda, terca, quarta, quinta, sexta, sabado. Exemplo: sabado[2]: escritorio,banheiro-escritorio. Use o nome do arquivo do ambiente, sem .toon."
        />
      ) : edit ? (
        <Editor
          key={edit[1]}
          title="Editar POP"
          filename={`${edit[1]}.toon`}
          fileUrl={`/api/environments/${edit[1]}/pop.toon`}
          saveUrl={`/environments/${edit[1]}/pop`}
          preview
          back={`#/a/${edit[1]}`}
        />
      ) : preview ? <Previa key={preview[1]} slug={preview[1]} />
      : env ? <Environment key={env[1]} slug={env[1]} />
        : cleaning ? <Cleaning key={cleaning[1]} id={cleaning[1]} />
        : <Home />}
    </main>
  );
}
