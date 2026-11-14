import { Cleaning } from './Cleaning.tsx';
import { Editor } from './Editor.tsx';
import { Environment } from './Environment.tsx';
import { Home } from './Home.tsx';
import { useHash } from './useHash.ts';

export function App() {
  const hash = useHash();
  const edit = /^#\/a\/([a-z0-9-]+)\/editar$/.exec(hash);
  const env = /^#\/a\/([a-z0-9-]+)$/.exec(hash);
  const cleaning = /^#\/l\/([\w-]+)$/.exec(hash);
  return (
    <main>
      {edit ? <Editor key={edit[1]} slug={edit[1]} />
        : env ? <Environment key={env[1]} slug={env[1]} />
        : cleaning ? <Cleaning key={cleaning[1]} id={cleaning[1]} />
        : <Home />}
    </main>
  );
}
