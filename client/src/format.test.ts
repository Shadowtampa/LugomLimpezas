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
