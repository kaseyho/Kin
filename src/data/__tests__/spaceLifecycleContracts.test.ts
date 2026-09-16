import {
  CONTENT_REPORT_CATEGORIES,
  isContentReportCategory,
} from '@/domain/models';

it('keeps report categories closed and validates untrusted input', () => {
  expect(CONTENT_REPORT_CATEGORIES).toEqual([
    'harassment',
    'threats',
    'hate',
    'sexual_content',
    'spam',
    'other',
  ]);
  expect(isContentReportCategory('harassment')).toBe(true);
  expect(isContentReportCategory('')).toBe(false);
  expect(isContentReportCategory('provider-specific-value')).toBe(false);
});
