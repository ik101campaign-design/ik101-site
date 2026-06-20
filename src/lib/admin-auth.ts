const TOKEN_KEY = 'ik101.gh_token';

export function storeToken(token: string): void { sessionStorage.setItem(TOKEN_KEY, token); }
export function getToken(): string | null { return sessionStorage.getItem(TOKEN_KEY); }
export function clearToken(): void { sessionStorage.removeItem(TOKEN_KEY); }

export function parseAuthMessage(data: unknown): string | null {
  if (typeof data !== 'string') return null;
  const m = data.match(/^authorization:github:success:(.+)$/);
  if (!m) return null;
  try { return ((JSON.parse(m[1]) as { token?: string }).token) ?? null; }
  catch { return null; }
}

// Opens the OAuth popup and resolves with the token (also stored).
// Speaks the Decap/Sveltia opener side of the handshake: the popup first
// announces `authorizing:github`, which we echo back; only then does it send
// the token. (Same protocol Sveltia uses, so /callback works for both.)
export function login(): Promise<string> {
  return new Promise((resolve, reject) => {
    const popup = window.open('/auth', 'ik101-auth', 'width=600,height=720');
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data === 'authorizing:github') {
        popup?.postMessage('authorizing:github', window.location.origin);
        return;
      }
      const token = parseAuthMessage(e.data);
      if (!token) return;
      storeToken(token);
      window.removeEventListener('message', onMsg);
      popup?.close();
      resolve(token);
    };
    window.addEventListener('message', onMsg);
    window.setTimeout(() => { window.removeEventListener('message', onMsg); reject(new Error('auth_timeout')); }, 120_000);
  });
}

// Authed fetch to the moderation API.
export function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token ?? ''}` } });
}
