export type PopProblem = { file: string; line?: number; message: string };
export type EnvironmentItem = { slug: string; name?: string; error?: PopProblem };

export type Atividade = { text: string; done: boolean; lapMs?: number; recordMs?: number; deltaMs?: number };
export type Etapa = { titulo: string; objetivo: string; aviso?: string; atividades: Atividade[] };
export type CleaningView = {
  id: string;
  environment: string;
  environmentName: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  startedAt: string;
  activeMs: number;
  running: boolean;
  etapas: Etapa[];
  progress: { done: number; total: number };
};
export type EnvironmentView = {
  slug: string;
  name: string;
  inProgress: { id: string; startedAt: string; done: number; total: number } | null;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch('/api' + path, {
    method: init?.method,
    headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error ?? `Erro ${r.status}`);
  return body as T;
}
