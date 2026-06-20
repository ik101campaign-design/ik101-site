import { parseAuthMessage, storeToken, getToken, clearToken } from '../../src/lib/admin-auth';

const mem: Record<string, string> = {};
(globalThis as any).sessionStorage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => { mem[k] = v; },
  removeItem: (k: string) => { delete mem[k]; },
};

test('parseAuthMessage extracts the token from the handshake string', () => {
  const msg = 'authorization:github:success:' + JSON.stringify({ token: 'abc', provider: 'github' });
  expect(parseAuthMessage(msg)).toBe('abc');
});

test('parseAuthMessage returns null for non-matching input', () => {
  expect(parseAuthMessage('nope')).toBeNull();
  expect(parseAuthMessage(42 as unknown)).toBeNull();
  expect(parseAuthMessage('authorization:github:success:{bad json')).toBeNull();
});

test('token store round-trips and clears', () => {
  storeToken('xyz');
  expect(getToken()).toBe('xyz');
  clearToken();
  expect(getToken()).toBeNull();
});
