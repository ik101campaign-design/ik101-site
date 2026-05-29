import { vi } from 'vitest';

vi.mock('../../src/lib/supabase', () => ({ supabase: {} }));

import { nextStatus, summarize } from '../../src/components/moderate/queue';

test('approve/reject map to status values', () => {
  expect(nextStatus('approve')).toBe('approved');
  expect(nextStatus('reject')).toBe('rejected');
});

test('summarize renders name or Anonymous + country', () => {
  expect(summarize({ id: '1', message: 'hi', display_name: null, country_code: 'PK' }))
    .toBe('Anonymous (PK): hi');
  expect(summarize({ id: '2', message: 'yo', display_name: 'Sara', country_code: 'US' }))
    .toBe('Sara (US): yo');
});
