# Unified GitHub-Login Admin (CMS + Moderation) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One GitHub login behind `/admin` that gives a non-technical operator two doors — a Sveltia content editor (commits → auto-deploy) and the voice-moderation queue — with moderation re-gated by GitHub identity (Supabase Auth dropped).

**Architecture:** Static Astro site + **Cloudflare Pages Functions** (in `functions/`, same domain, auto-deploy with the site). The Functions are: an OAuth relay (`/auth`, `/callback`) and an identity-gated moderation API (`/api/pending`, `/api/moderate`) that talks to Supabase with the service-role key. Sveltia commits content to the repo via the GitHub token. One GitHub OAuth App backs all of it; its secret + the Supabase service-role key live only in the Pages env.

**Tech Stack:** Astro 4, TypeScript, Cloudflare Pages Functions (`@cloudflare/workers-types`), Sveltia CMS, Supabase REST (service role), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-unified-github-admin-design.md`

---

## File Structure

```
functions/
  auth.ts                 # GET /auth  → redirect to GitHub OAuth
  callback.ts             # GET /callback → token exchange + postMessage relay
  api/pending.ts          # GET /api/pending → identity-gated pending list
  api/moderate.ts         # POST /api/moderate → identity-gated approve/reject
  _lib/github.ts          # verify GitHub token → login; allowlist check  (TESTED)
  tsconfig.json           # Workers-types config — keeps DOM globals out of src/
src/lib/admin-auth.ts     # client: OAuth popup + token storage + authed fetch  (TESTED)
src/pages/admin.astro     # dashboard: sign in → two doors
src/pages/moderate.astro  # (modify) GitHub sign-in instead of email
src/components/moderate/queue.ts  # (modify) mountModerate → Functions API
public/cms/index.html     # Sveltia loader
public/cms/config.yml      # Sveltia config (hero collection)
tests/unit/github-lib.test.ts, admin-auth.test.ts  # new unit tests
```

---

## Task 1: Cloudflare Functions toolchain

**Files:** Modify `package.json`, `tsconfig.json`; create `functions/tsconfig.json`

Why two tsconfigs: `@cloudflare/workers-types` redefines DOM globals (`Response`, `Request`, `fetch`, `crypto`…). Loading it into the root program that also type-checks browser-side `src/` produces "duplicate identifier" errors. So the root config **excludes** `functions/`, and the Functions get their own config with the Workers types and no DOM lib.

- [ ] **Step 1: Add the Cloudflare types dev-dependency**

Run: `npm install -D @cloudflare/workers-types@^4`
Expected: added to devDependencies.

- [ ] **Step 2: Exclude `functions/` from the root (Astro/DOM) config**

Set `tsconfig.json` to (keep `vitest/globals`; add the exclude):
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": { "types": ["vitest/globals"] },
  "exclude": ["functions"]
}
```

- [ ] **Step 3: Create `functions/tsconfig.json` (Workers env, no DOM)**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["**/*.ts"]
}
```
(No `.ts` files exist under `functions/` yet, so don't run `tsc -p functions/tsconfig.json` until Task 2 — it would error "No inputs were found".)

- [ ] **Step 4: Verify root build + tests unaffected**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: no type errors; build OK; 23 tests pass.

- [ ] **Step 5: Commit (also commits the design spec + this plan)**

```bash
git add package.json package-lock.json tsconfig.json functions/tsconfig.json docs/superpowers
git commit -m "chore: add Cloudflare Functions toolchain + commit CMS/admin spec+plan"
```

---

## Task 2: `functions/_lib/github.ts` — identity check (TDD)

**Files:** Create `functions/_lib/github.ts`; Test `tests/unit/github-lib.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- github-lib`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `functions/_lib/github.ts`**

```ts
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
```

- [ ] **Step 4: Run, verify pass + type-check the Functions program**

Run: `npm test -- github-lib && npx tsc --noEmit -p functions/tsconfig.json`
Expected: PASS (3 tests); no type errors (now that a `.ts` file exists under `functions/`).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/github.ts tests/unit/github-lib.test.ts
git commit -m "feat: GitHub identity verification helper for Functions (tested)"
```

---

## Task 3: `src/lib/admin-auth.ts` — client auth helper (TDD)

**Files:** Create `src/lib/admin-auth.ts`; Test `tests/unit/admin-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- admin-auth`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/lib/admin-auth.ts`**

```ts
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
export function login(): Promise<string> {
  return new Promise((resolve, reject) => {
    const popup = window.open('/auth', 'ik101-auth', 'width=600,height=720');
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
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
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- admin-auth`
Expected: PASS (3 tests). Then `npm test` → full suite (now 29 tests) green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-auth.ts tests/unit/admin-auth.test.ts
git commit -m "feat: client admin-auth (OAuth popup, token store, authed fetch) with tests"
```

---

## Task 4: OAuth relay Functions (`/auth`, `/callback`)

**Files:** Create `functions/auth.ts`, `functions/callback.ts`

Pages Functions are request handlers — not unit-tested here; verified locally with `wrangler pages dev` in Task 9. Provide the exact code.

- [ ] **Step 1: Create `functions/auth.ts`**

```ts
interface Env { GITHUB_CLIENT_ID: string }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const state = crypto.randomUUID();
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', ctx.env.GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', `${url.origin}/callback`);
  authUrl.searchParams.set('scope', 'repo');
  authUrl.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': `ik101_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
};
```

- [ ] **Step 2: Create `functions/callback.ts`**

```ts
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
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit -p functions/tsconfig.json && npm run build`
Expected: no errors (Functions type-check under their own Workers config; the Astro build ignores `functions/`).

- [ ] **Step 4: Commit**

```bash
git add functions/auth.ts functions/callback.ts
git commit -m "feat: GitHub OAuth relay Pages Functions (auth + callback)"
```

---

## Task 5: Moderation API Functions (`/api/pending`, `/api/moderate`)

**Files:** Create `functions/api/pending.ts`, `functions/api/moderate.ts`

- [ ] **Step 1: Create `functions/api/pending.ts`**

```ts
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
```

- [ ] **Step 2: Create `functions/api/moderate.ts`**

```ts
import { isAllowedAdmin } from '../_lib/github';

interface Env { ALLOWED_GITHUB_LOGIN: string; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const token = (ctx.request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !(await isAllowedAdmin(token, ctx.env.ALLOWED_GITHUB_LOGIN))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id, action } = (await ctx.request.json()) as { id?: string; action?: 'approve' | 'reject' };
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const status = action === 'approve' ? 'approved' : 'rejected';
  const res = await fetch(`${ctx.env.SUPABASE_URL}/rest/v1/messages?id=eq.${id}`, {
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p functions/tsconfig.json`
Expected: no errors (`isAllowedAdmin` resolves from `_lib/github`).

- [ ] **Step 4: Commit**

```bash
git add functions/api/pending.ts functions/api/moderate.ts
git commit -m "feat: identity-gated moderation API Functions (service-role Supabase writes)"
```

---

## Task 6: Sveltia CMS files

**Files:** Create `public/cms/index.html`, `public/cms/config.yml`

- [ ] **Step 1: Create `public/cms/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>IK101 — Content</title>
  </head>
  <body>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `public/cms/config.yml`** (replace `REPLACE_WITH_SITE_DOMAIN` with the live Pages URL at setup time — Task 9)

```yaml
backend:
  name: github
  repo: ik101campaign-design/ik101-site
  branch: main
  base_url: https://REPLACE_WITH_SITE_DOMAIN
media_folder: public/uploads
public_folder: /uploads
collections:
  - name: hero
    label: Hero
    files:
      - name: main
        label: Hero section
        file: src/content/hero/main.json
        fields:
          - { name: eyebrow, label: Eyebrow, widget: string }
          - { name: headline, label: "Headline (line 1)", widget: string }
          - { name: headlineAccent, label: "Headline (line 2)", widget: string }
          - { name: subhead, label: Subheadline, widget: text }
          - { name: ctaLabel, label: "Button label", widget: string }
          - { name: pendingMessage, label: "After-submit message", widget: text }
```

- [ ] **Step 3: Build (confirms the static files ship to `dist/cms/`)**

Run: `npm run build && ls dist/cms/`
Expected: `index.html` and `config.yml` present in `dist/cms/`.

- [ ] **Step 4: Commit**

```bash
git add public/cms/index.html public/cms/config.yml
git commit -m "feat: Sveltia CMS loader + config (hero collection)"
```

---

## Task 7: `/admin` dashboard

**Files:** Create `src/pages/admin.astro`

- [ ] **Step 1: Create `src/pages/admin.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="IK101 — Admin">
  <main class="admin">
    <h1>IK101 Admin</h1>
    <button data-admin-login class="admin__btn admin__btn--primary" type="button">Sign in with GitHub</button>
    <div data-admin-doors hidden class="admin__doors">
      <a class="admin__door" href="/cms/"><b>Edit content</b><span>Update the site's words &amp; images</span></a>
      <a class="admin__door" href="/moderate"><b>Moderate voices</b><span>Approve or reject submitted messages</span></a>
    </div>
    <p data-admin-status class="admin__status"></p>
  </main>
  <style>
    .admin { max-width: 560px; margin: 4rem auto; padding: 0 1.5rem; font-family: 'Hanken Grotesk', system-ui, sans-serif; color: #16201b; }
    .admin h1 { font-size: 2rem; font-weight: 600; }
    .admin__btn--primary { background: #00bf63; color: #16201b; border: 0; border-radius: 100px; padding: 0.8rem 1.6rem; font: inherit; font-weight: 600; cursor: pointer; }
    .admin__doors { display: grid; gap: 1rem; margin-top: 2rem; }
    .admin__door { display: block; padding: 1.2rem 1.4rem; border: 1px solid rgba(20,40,28,0.12); border-radius: 16px; text-decoration: none; color: inherit; transition: border-color .2s, transform .2s; }
    .admin__door:hover { border-color: #00bf63; transform: translateY(-1px); }
    .admin__door b { display: block; font-size: 1.1rem; }
    .admin__door span { color: #5a6b62; font-size: 0.9rem; }
    .admin__status { color: #b03030; margin-top: 1rem; }
  </style>
  <script>
    import { login, getToken } from '../lib/admin-auth';
    const btn = document.querySelector('[data-admin-login]');
    const doors = document.querySelector('[data-admin-doors]');
    const status = document.querySelector('[data-admin-status]');
    const reveal = () => { if (btn) btn.hidden = true; if (doors) doors.hidden = false; };
    if (getToken()) reveal();
    btn?.addEventListener('click', async () => {
      try { await login(); reveal(); }
      catch { if (status) status.textContent = 'Sign-in failed or timed out. Try again.'; }
    });
  </script>
</Layout>
```

- [ ] **Step 2: Build**

Run: `npm run build && ls dist/admin/`
Expected: `dist/admin/index.html` exists.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat: /admin dashboard (GitHub sign-in -> two doors)"
```

---

## Task 8: Rework moderation onto GitHub auth

**Files:** Modify `src/components/moderate/queue.ts`, `src/pages/moderate.astro`

- [ ] **Step 1a: Fix the imports at the top of `src/components/moderate/queue.ts`**

The file currently starts with `import { supabase } from '../../lib/supabase';` then `import type { MessageRow } from '../../lib/voices';`. Replace **both** of those first two lines (the `supabase` client is no longer used here) with:

```ts
import { login, getToken, api } from '../../lib/admin-auth';
import type { MessageRow } from '../../lib/voices';
```

- [ ] **Step 1b: Replace the `mountModerate` function**

Keep `nextStatus` and `summarize` EXACTLY as they are (their tests must stay green). Replace the entire existing `mountModerate` function — do NOT re-declare the imports (already handled in Step 1a) — with:

```ts
export async function mountModerate(): Promise<void> {
  const gate = document.querySelector<HTMLElement>('[data-auth-gate]');
  const queue = document.querySelector<HTMLElement>('[data-queue]');
  const signInBtn = document.querySelector<HTMLButtonElement>('[data-login-github]');
  const err = document.querySelector<HTMLElement>('[data-login-error]');
  if (!gate || !queue) return;

  signInBtn?.addEventListener('click', async () => {
    try { await login(); await showQueue(); }
    catch { if (err) err.textContent = 'Sign-in failed. Try again.'; }
  });
  if (getToken()) await showQueue();

  async function showQueue() {
    const res = await api('/api/pending');
    if (res.status === 403) { if (err) err.textContent = 'That GitHub account is not authorized.'; return; }
    gate!.hidden = true; queue!.hidden = false;
    const data = res.ok ? ((await res.json()) as MessageRow[]) : [];
    queue!.replaceChildren();
    if (data.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'Nothing awaiting review.';
      queue!.appendChild(empty);
      return;
    }
    for (const row of data) {
      const card = document.createElement('div');
      card.style.cssText = 'background:#fff;border:1px solid rgba(20,40,28,0.08);border-radius:14px;padding:14px 16px;margin:10px 0;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 2px 10px rgba(20,40,28,0.05);';
      const text = document.createElement('span');
      text.textContent = summarize(row);
      card.appendChild(text);
      const actions = document.createElement('div');
      for (const action of ['approve', 'reject'] as const) {
        const btn = document.createElement('button');
        btn.textContent = action;
        btn.dataset.action = action;
        btn.style.cssText = action === 'approve'
          ? 'margin-left:8px;padding:7px 16px;border:0;border-radius:100px;cursor:pointer;font-weight:600;background:#00bf63;color:#16201b;'
          : 'margin-left:8px;padding:7px 16px;border:1px solid rgba(20,40,28,0.18);border-radius:100px;cursor:pointer;background:transparent;color:#5a6b62;';
        btn.addEventListener('click', async () => {
          const r = await api('/api/moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: row.id, action }),
          });
          if (r.ok) card.remove();
        });
        actions.appendChild(btn);
      }
      card.appendChild(actions);
      queue!.appendChild(card);
    }
  }
}
```

- [ ] **Step 2: Replace the login form in `src/pages/moderate.astro`**

Replace the `<section data-auth-gate>…</section>` block with a single GitHub button (keep `[data-auth-gate]`, `[data-queue]`, `[data-login-error]` so the script + e2e selectors hold):

```astro
    <section data-auth-gate>
      <button data-login-github type="button">Sign in with GitHub</button>
      <p data-login-error role="alert"></p>
    </section>
```

- [ ] **Step 3: Type-check, build, test**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: no type errors; build OK; **all unit tests pass** (`queue.ts`'s `nextStatus`/`summarize` tests are unaffected; the now-unused `supabase` import was removed in Step 1a).

- [ ] **Step 4: Commit**

```bash
git add src/components/moderate/queue.ts src/pages/moderate.astro
git commit -m "feat: moderation via GitHub identity + Functions API (drops Supabase Auth)"
```

---

## Task 9: Setup, deploy, and end-to-end verification

**Files:** Modify `public/cms/config.yml` (fill the real domain)

- [ ] **Step 1: (USER) Register the GitHub OAuth App**

On the `ik101campaign-design` account → Settings → Developer settings → OAuth Apps → New:
- Homepage URL: the live site URL (e.g. `https://ik101-site.pages.dev`)
- Authorization callback URL: `https://ik101-site.pages.dev/callback`
Copy the **Client ID** and generate a **Client Secret**.

- [ ] **Step 2: (USER) Add the Pages secrets**

Cloudflare → the Pages project → Settings → Variables and Secrets → add as **encrypted secrets**:
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SUPABASE_URL` (`https://qealqpuhvzpkdcqpqpvo.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Settings → API → service_role), `ALLOWED_GITHUB_LOGIN` (the editor's GitHub username).

- [ ] **Step 3: Fill the CMS config domain + push**

In `public/cms/config.yml`, set `base_url:` to the live site origin (no trailing slash). Then:
```bash
git add public/cms/config.yml
git commit -m "chore: point Sveltia base_url at the live domain"
git push
```
Cloudflare auto-deploys the site **and** the Functions.

- [ ] **Step 4: (Optional) Local smoke with wrangler**

Run: `npx wrangler pages dev dist --compatibility-date=2024-01-01` (after `npm run build`), with the env vars exported locally, and hit `/admin`.
Expected: sign-in popup → token; `/api/pending` returns 403 without a valid token, data with one.

- [ ] **Step 5: Live end-to-end**

Visit `https://<site>/admin` → Sign in with GitHub (as the allowed account) → two doors appear.
- **Edit content:** open `/cms/`, change the hero headline, Publish → a commit lands on `main` → Cloudflare rebuilds → the homepage updates.
- **Moderate:** open `/moderate`, approve a pending voice → its dot appears on the globe.
- A non-allowed GitHub account → `/api/pending` returns 403, moderation shows "not authorized."

- [ ] **Step 6: Final full-suite check + commit any config**

Run: `npm test && npm run build`
Expected: all unit tests pass; clean build.
```bash
git add -A && git commit -m "chore: CMS+admin live verification" --allow-empty
git push
```

---

## Self-Review Notes (author)

- **Spec coverage:** OAuth relay (Task 4) · moderation API + identity gate (Tasks 2,5) · client auth helper (Task 3) · `/admin` dashboard two-doors (Task 7) · Sveltia CMS + hero collection (Task 6) · moderation rework / drop Supabase Auth (Task 8) · same-domain Pages Functions / no CORS (Tasks 4–5) · security: service-role only in Functions, GitHub-login allowlist (Tasks 2,5,9) · error handling: 403 + non-destructive failures (Tasks 5,8) · testing (Tasks 2,3,8) · user setup OAuth App + secrets (Task 9). All §-sections map to a task.
- **Type consistency:** `getGitHubLogin`/`isAllowedAdmin`, `login`/`getToken`/`storeToken`/`parseAuthMessage`/`api`, `MessageRow`, `nextStatus`/`summarize` used with consistent signatures across tasks. `Env` interfaces are declared per-Function (Pages Functions don't share a global type) — intentional, not a mismatch.
- **Known fill-ins (flagged, not silent):** `REPLACE_WITH_SITE_DOMAIN` in `config.yml` (Task 6) is filled with the real Pages URL in Task 9 Step 3; the GitHub OAuth App + Pages secrets are user actions in Task 9. These are deploy-time values, not undefined logic.
- **Out of scope (per spec §13):** more collections, multi-editor roles, GitHub-App token hardening, the submit-message edge function.
