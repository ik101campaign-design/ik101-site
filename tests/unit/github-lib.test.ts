import { getGitHubLogin, isAllowedAdmin } from '../../functions/_lib/github';

const fakeFetch = (status: number, body: unknown) =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;

test('getGitHubLogin returns the login on 200', async () => {
  expect(await getGitHubLogin('t', fakeFetch(200, { login: 'ik101campaign-design' }))).toBe('ik101campaign-design');
});

test('getGitHubLogin returns null on a non-ok response', async () => {
  expect(await getGitHubLogin('t', fakeFetch(401, {}))).toBeNull();
});

test('isAllowedAdmin matches case-insensitively, rejects others', async () => {
  expect(await isAllowedAdmin('t', 'ik101campaign-design', fakeFetch(200, { login: 'IK101campaign-design' }))).toBe(true);
  expect(await isAllowedAdmin('t', 'ik101campaign-design', fakeFetch(200, { login: 'someone-else' }))).toBe(false);
  expect(await isAllowedAdmin('t', 'ik101campaign-design', fakeFetch(401, {}))).toBe(false);
});
