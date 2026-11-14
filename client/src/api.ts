export type PopProblem = { file: string; line?: number; message: string };
export type EnvironmentItem = { slug: string; name?: string; error?: PopProblem };

export type Atividade = { text: string; descricao?: string; done: boolean; lapMs?: number; recordMs?: number; deltaMs?: number };
export type Etapa = { titulo: string; objetivo: string; aviso?: string; atividades: Atividade[] };
export type CleaningResult = {
  totalMs: number;
  fastestOtherMs: number | null;
  diffMs: number | null;
  newRecord: boolean;
  brokenRecords: { text: string; lapMs: number; recordMs: number }[];
};
export type CleaningView = {
  id: string;
  environment: string;
  environmentName: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  startedAt: string;
  activeMs: number;
  running: boolean;
  endedAt: string | null;
  result: CleaningResult | null;
  etapas: Etapa[];
  progress: { done: number; total: number };
};
export type HistoryItem = {
  id: string;
  startedAt: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  totalMs: number;
  done: number;
  total: number;
};
export type EnvironmentView = {
  slug: string;
  name: string;
  inProgress: { id: string; startedAt: string; done: number; total: number } | null;
  fastestMs: number | null;
  history: HistoryItem[];
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch('/api' + path, {
    method: init?.method,
    headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error ?? `Erro ${r.status}`, body);
  return body as T;
}
