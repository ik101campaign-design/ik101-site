import { isAllowedAdmin } from '../_lib/github';

interface Env { ALLOWED_GITHUB_LOGIN: string; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const token = (ctx.request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !(await isAllowedAdmin(token, ctx.env.ALLOWED_GITHUB_LOGIN))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: { id?: string; action?: 'approve' | 'reject' };
  try {
    body = (await ctx.request.json()) as { id?: string; action?: 'approve' | 'reject' };
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const { id, action } = body;
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const status = action === 'approve' ? 'approved' : 'rejected';
  const res = await fetch(`${ctx.env.SUPABASE_URL}/rest/v1/messages?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${ctx.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status }),
  });
  return Response.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
};
