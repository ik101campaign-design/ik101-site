interface Env { GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string }

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
  const payload = data.access_token
    ? `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: 'github' })}`
    : `authorization:github:error:${JSON.stringify({ message: 'No token returned' })}`;
  const html = `<!doctype html><meta charset="utf-8"><script>
    (function(){ try { window.opener && window.opener.postMessage(${JSON.stringify(payload)}, ${JSON.stringify(url.origin)}); } finally { window.close(); } })();
  </script>You can close this window.`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'ik101_oauth_state=; Max-Age=0; Path=/' },
  });
};
