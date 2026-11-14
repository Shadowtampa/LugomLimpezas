export type PopProblem = { file: string; line?: number; message: string };
export type EnvironmentItem = { slug: string; name?: string; error?: PopProblem };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch('/api' + path, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `Erro ${r.status}`);
  return body as T;
}
