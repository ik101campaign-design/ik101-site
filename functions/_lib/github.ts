interface GitHubUser { login?: string }

export async function getGitHubLogin(token: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const res = await fetcher('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'ik101-admin',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as GitHubUser;
  return user.login ?? null;
}

export async function isAllowedAdmin(token: string, allowedLogin: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const login = await getGitHubLogin(token, fetcher);
  return !!login && login.toLowerCase() === allowedLogin.toLowerCase();
}
