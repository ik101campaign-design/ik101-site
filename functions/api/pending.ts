import { isAllowedAdmin } from '../_lib/github';

interface Env { ALLOWED_GITHUB_LOGIN: string; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const token = (ctx.request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !(await isAllowedAdmin(token, ctx.env.ALLOWED_GITHUB_LOGIN))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const res = await fetch(
    `${ctx.env.SUPABASE_URL}/rest/v1/messages?status=eq.pending&select=id,message,display_name,country_code&order=created_at.asc`,
    { headers: { apikey: ctx.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${ctx.env.SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  if (!res.ok) return Response.json({ error: 'supabase' }, { status: 502 });
  return Response.json(await res.json());
};
