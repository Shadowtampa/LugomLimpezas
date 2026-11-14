// Chaves iguais às da agenda (sem acento), na ordem de Date.getDay() (domingo = 0).
export const DAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
export const DAY_LONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'] as const;
export const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export type DayKey = (typeof DAY_KEYS)[number];

const pad = (n: number) => String(n).padStart(2, '0');

// Dia local como AAAA-MM-DD, para comparar dias sem se enrolar com fuso.
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type WeekDay = { index: number; key: DayKey; date: Date; day: string; isToday: boolean };

// A semana começa no domingo, como no calendário.
export function weekOf(now: Date): WeekDay[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return DAY_KEYS.map((key, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { index, key, date, day: localDay(date), isToday: localDay(date) === localDay(now) };
  });
}

export type RecentCleaning = { environment: string; status: string; startedAt: string; endedAt: string | null };

// Ambientes com limpeza concluída naquele dia local.
export function completedOn(recent: RecentCleaning[], day: string): Set<string> {
  return new Set(
    recent.filter((r) => r.status === 'completed' && r.endedAt && localDay(new Date(r.endedAt)) === day).map((r) => r.environment),
  );
}
