import { buildSubmission, submitMessage } from '../../src/components/hero/contribution-form';
import { isValidCountryCode } from '../../src/lib/countries';
import { test, expect } from 'vitest';

test('buildSubmission trims and nulls empty name', () => {
  expect(buildSubmission({ message: '  hi  ', displayName: '   ', countryCode: 'PK' }))
    .toEqual({ message: 'hi', displayName: null, countryCode: 'PK' });
});

test('submitMessage rejects invalid input before calling network', async () => {
  let called = false;
  const fetcher = async () => { called = true; return { ok: true } as Response; };
  const res = await submitMessage({ message: '', countryCode: 'PK' }, isValidCountryCode, fetcher as any, '/fn');
  expect(res.ok).toBe(false);
  expect(res.errors).toContain('message_required');
  expect(called).toBe(false);
});

test('submitMessage posts to the edge function on valid input', async () => {
  let url = '';
  const fetcher = async (u: string) => { url = u; return { ok: true, status: 201 } as Response; };
  const res = await submitMessage({ message: 'Free PK', countryCode: 'PK' }, isValidCountryCode, fetcher as any, '/fn');
  expect(res.ok).toBe(true);
  expect(url).toBe('/fn');
});
