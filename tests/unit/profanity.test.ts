import { containsProfanity } from '../../src/lib/profanity';

const list = ['badword', 'slur'];

test('detects a blocked word as a whole word', () => {
  expect(containsProfanity('this is a badword here', list)).toBe(true);
});

test('is case-insensitive', () => {
  expect(containsProfanity('SLUR!', list)).toBe(true);
});

test('does not match substrings of clean words', () => {
  expect(containsProfanity('badwordsmith is fine', list)).toBe(false);
  expect(containsProfanity('a clean sentence', list)).toBe(false);
});
