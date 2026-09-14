import { readDemoDate } from '../demoDate';

it('accepts only real ISO calendar dates for deterministic demos', () => {
  expect(readDemoDate('2026-12-05')).toBe('2026-12-05');
  expect(readDemoDate('2026-02-30')).toBeUndefined();
  expect(readDemoDate(['2026-12-05'])).toBeUndefined();
  expect(readDemoDate(undefined)).toBeUndefined();
});
