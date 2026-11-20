import { expect, it } from 'vitest';
import { completedOn, DAY_KEYS, localDay, weekOf } from './week.ts';

it('a semana começa no domingo e marca o dia de hoje', () => {
  const thursday = new Date(2026, 10, 12, 15, 30); // quinta-feira, 12/11/2026
  const w = weekOf(thursday);
  expect(w.map((d) => d.key)).toEqual([...DAY_KEYS]);
  expect(w[0].day).toBe('2026-11-08'); // domingo
  expect(w[6].day).toBe('2026-11-14'); // sábado
  expect(w.filter((d) => d.isToday).map((d) => d.key)).toEqual(['quinta']);
});

it('a semana atravessa a virada de mês', () => {
  const w = weekOf(new Date(2026, 11, 1)); // terça, 01/12/2026
  expect(w[0].day).toBe('2026-11-29');
  expect(w[2].isToday).toBe(true);
});

it('só limpezas concluídas no dia contam como feitas', () => {
  const at = (d: Date) => d.toISOString();
  const day = new Date(2026, 10, 12, 10, 0);
  const recent = [
    { environment: 'escritorio', pop: 'rapido', status: 'completed', startedAt: at(day), endedAt: at(new Date(2026, 10, 12, 11, 0)) },
    { environment: 'quarto', status: 'abandoned', startedAt: at(day), endedAt: at(new Date(2026, 10, 12, 11, 0)) },
    { environment: 'banheiro', status: 'in_progress', startedAt: at(day), endedAt: null },
    { environment: 'outro', status: 'completed', startedAt: at(day), endedAt: at(new Date(2026, 10, 13, 9, 0)) },
  ];
  expect([...completedOn(recent, localDay(day))]).toEqual(['escritorio', 'escritorio/rapido']);
});
