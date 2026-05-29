import { validateSubmission, MAX_MESSAGE } from '../../src/lib/validation';

const okCountry = (c: string) => c === 'PK';

test('valid submission passes', () => {
  const r = validateSubmission({ message: 'Free Pakistan', countryCode: 'PK' }, okCountry);
  expect(r).toEqual({ ok: true, errors: [] });
});

test('empty message rejected', () => {
  const r = validateSubmission({ message: '   ', countryCode: 'PK' }, okCountry);
  expect(r.ok).toBe(false);
  expect(r.errors).toContain('message_required');
});

test('message over limit rejected', () => {
  const r = validateSubmission({ message: 'x'.repeat(MAX_MESSAGE + 1), countryCode: 'PK' }, okCountry);
  expect(r.errors).toContain('message_too_long');
});

test('invalid/missing country rejected', () => {
  expect(validateSubmission({ message: 'hi', countryCode: '' }, okCountry).errors).toContain('country_required');
  expect(validateSubmission({ message: 'hi', countryCode: 'US' }, okCountry).errors).toContain('country_invalid');
});

test('over-long display name rejected', () => {
  const r = validateSubmission({ message: 'hi', countryCode: 'PK', displayName: 'n'.repeat(61) }, okCountry);
  expect(r.errors).toContain('name_too_long');
});
