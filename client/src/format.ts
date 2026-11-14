const pad = (n: number) => String(n).padStart(2, '0');

// Duração em m:ss, ou h:mm:ss a partir de uma hora.
export function formatDuration(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Diferença para o recorde: −0:12 (mais rápido) ou +0:08 (mais lento); o sinal sempre aparece.
export function formatDelta(ms: number): string {
  const secs = Math.round(Math.abs(ms) / 1000);
  if (secs === 0) return '±0:00';
  return (ms < 0 ? '−' : '+') + formatDuration(secs * 1000);
}

export function deltaClass(ms: number): 'melhor' | 'pior' | 'igual' {
  const secs = Math.round(Math.abs(ms) / 1000);
  return secs === 0 ? 'igual' : ms < 0 ? 'melhor' : 'pior';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// Datas no fuso do navegador; o armazenamento é em ISO.
export function formatDayMonth(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${formatDayMonth(iso)}/${d.getFullYear()}`;
}
