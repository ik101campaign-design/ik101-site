interface Env { GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string }

const PROVIDER = 'github';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = /ik101_oauth_state=([^;]+)/.exec(ctx.request.headers.get('Cookie') ?? '')?.[1];
  if (!code || !state || state !== savedState) {
    return new Response('Invalid OAuth state', { status: 400 });
  }
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: ctx.env.GITHUB_CLIENT_ID, client_secret: ctx.env.GITHUB_CLIENT_SECRET, code }),
  });
  const data = (await tokenRes.json()) as { access_token?: string };
  const ok = !!data.access_token;
  const content = ok
    ? { provider: PROVIDER, token: data.access_token }
    : { provider: PROVIDER, error: 'No token returned', errorCode: 'TOKEN_REQUEST_FAILED' };
  const message = `authorization:${PROVIDER}:${ok ? 'success' : 'error'}:${JSON.stringify(content)}`;

  // Canonical Decap/Sveltia popup relay (matches sveltia-cms-auth): announce
  // `authorizing:github` to the opener, and when the opener echoes it back, post
  // the token to THAT message's origin. Do not self-close — the opener closes us.
  const html = `<!doctype html><html><body><script>
    (function () {
      window.addEventListener('message', function (e) {
        if (e.data === 'authorizing:${PROVIDER}' && window.opener) {
          window.opener.postMessage(${JSON.stringify(message)}, e.origin);
        }
      });
      if (window.opener) {
        window.opener.postMessage('authorizing:${PROVIDER}', '*');
      } else {
        document.body.textContent = 'No opener window — close this tab and retry from the admin.';
      }
    })();
  </script></body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'ik101_oauth_state=; Max-Age=0; Path=/' },
  });
};
