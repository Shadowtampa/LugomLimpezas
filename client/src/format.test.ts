import { expect, it } from 'vitest';
import { formatDuration } from './format.ts';

it('formata m:ss e h:mm:ss', () => {
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(8_900)).toBe('0:08');
  expect(formatDuration(72_000)).toBe('1:12');
  expect(formatDuration(3_600_000)).toBe('1:00:00');
  expect(formatDuration(3_725_000)).toBe('1:02:05');
  expect(formatDuration(-5)).toBe('0:00');
});

import { deltaClass, formatDelta } from './format.ts';

it('formata a diferença com sinal sempre visível', () => {
  expect(formatDelta(-12_000)).toBe('−0:12');
  expect(formatDelta(8_000)).toBe('+0:08');
  expect(formatDelta(-65_000)).toBe('−1:05');
  expect(formatDelta(200)).toBe('±0:00');
  expect(deltaClass(-12_000)).toBe('melhor');
  expect(deltaClass(8_000)).toBe('pior');
  expect(deltaClass(100)).toBe('igual');
});

import { formatDate, formatDayMonth } from './format.ts';

it('formata datas como DD/MM e DD/MM/AAAA', () => {
  const iso = new Date(2026, 10, 5, 12, 0).toISOString(); // 5 de novembro, meio-dia local
  expect(formatDayMonth(iso)).toBe('05/11');
  expect(formatDate(iso)).toBe('05/11/2026');
});
