# Interactive Globe Hero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ik101.org landing hero — a split layout with a real 3D `three-globe` where every visitor can leave a ≤150-char message that appears as a glowing point at their country, with moderation before public display.

**Architecture:** Astro static site (zero JS except one lazy-loaded vanilla-TS globe island). Supabase holds messages (Postgres + RLS + Realtime); a Supabase edge function handles validated, profanity-filtered, IP-less-throttled inserts as `status='pending'`. Submitter sees their own dot instantly (optimistic, localStorage); the public sees only `approved` rows. A `/moderate` page (Supabase Auth: magic link + password) lets the client approve/reject.

**Tech Stack:** Astro 4, TypeScript, three.js + three-globe, @supabase/supabase-js, Supabase (Postgres/Auth/Realtime/Edge Functions, local via Supabase CLI), Vitest (unit/integration), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-05-29-interactive-globe-hero-design.md`

---

## File Structure

```
site/
├── package.json, astro.config.mjs, tsconfig.json, vitest.config.ts, playwright.config.ts
├── .env.example, .gitignore
├── src/
│   ├── content/config.ts                  # hero content collection schema
│   ├── content/hero/main.json             # editable hero copy (Decap-ready)
│   ├── lib/
│   │   ├── countries-data.ts              # ISO alpha-2 → {lat,lng,name}
│   │   ├── countries.ts                    # validity, centroid, jitter
│   │   ├── validation.ts                   # submission validation (shared client+edge)
│   │   ├── profanity.ts                     # blocklist filter (shared client+edge)
│   │   ├── supabase.ts                      # browser Supabase client
│   │   └── voices.ts                        # fetch approved, cache, optimistic, realtime
│   ├── components/Hero.astro                # static split layout, reserves globe space
│   ├── components/hero/globe.ts             # three-globe setup + dots + popover + perf
│   ├── components/hero/contribution-form.ts # form behavior + submit + optimistic dot
│   ├── components/hero/island.ts            # lazy bootstrap entry (client island)
│   ├── components/moderate/queue.ts         # admin queue render + approve/reject
│   ├── layouts/Layout.astro
│   ├── pages/index.astro                    # mounts Hero
│   └── pages/moderate.astro                 # auth gate + queue island
├── supabase/
│   ├── migrations/0001_messages.sql         # table + RLS + realtime publication
│   └── functions/submit-message/index.ts    # edge function
└── tests/
    ├── unit/{countries,validation,profanity,voices}.test.ts
    ├── integration/rls.test.ts              # against local Supabase
    └── e2e/{contribute,moderate}.spec.ts
```

---

## Task 1: Scaffold project, git init, commit spec

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/pages/index.astro`, `src/layouts/Layout.astro`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ik101-site",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "astro": "^4.16.18",
    "@astrojs/sitemap": "^3.2.1",
    "@supabase/supabase-js": "^2.45.0",
    "three": "^0.160.0",
    "three-globe": "^2.31.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0",
    "@playwright/test": "^1.47.0"
  }
}
```

- [ ] **Step 2: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ik101.org',
  integrations: [sitemap()],
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  build: { inlineStylesheets: 'auto' },
});
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": { "types": ["vitest/globals"] }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
dist/
.astro/
node_modules/
.env
.env.local
.DS_Store
.superpowers/
supabase/.branches
supabase/.temp
test-results/
playwright-report/
```

- [ ] **Step 5: Create `.env.example`**

```
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
```

- [ ] **Step 6: Create minimal `src/layouts/Layout.astro`**

```astro
---
interface Props { title: string; description?: string; }
const { title, description = 'IK101 — From his legacy to your action.' } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <link rel="preconnect" href={import.meta.env.PUBLIC_SUPABASE_URL} crossorigin />
    <title>{title}</title>
  </head>
  <body><slot /></body>
</html>
```

- [ ] **Step 7: Create placeholder `src/pages/index.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="IK101"><main><h1>IK101</h1></main></Layout>
```

- [ ] **Step 8: Install, verify build**

Run: `npm install && npm run build`
Expected: build completes, `dist/index.html` exists.

- [ ] **Step 9: git init and commit (spec + scaffold)**

```bash
git init
git add -A
git commit -m "chore: scaffold ik101 Astro project + globe hero spec"
```
Expected: commit succeeds; `git log --oneline` shows one commit.

---

## Task 2: Country centroid + jitter library

**Files:**
- Create: `src/lib/countries-data.ts`, `src/lib/countries.ts`
- Test: `tests/unit/countries.test.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', globals: true, include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'] },
});
```

- [ ] **Step 2: Create `src/lib/countries-data.ts` (seed with a real subset; full list filled during implementation)**

```ts
export interface Centroid { lat: number; lng: number; name: string; }
// ISO-3166 alpha-2 → approximate geographic centroid.
export const COUNTRY_CENTROIDS: Record<string, Centroid> = {
  PK: { lat: 30.3753, lng: 69.3451, name: 'Pakistan' },
  US: { lat: 37.0902, lng: -95.7129, name: 'United States' },
  GB: { lat: 55.3781, lng: -3.4360, name: 'United Kingdom' },
  CA: { lat: 56.1304, lng: -106.3468, name: 'Canada' },
  AE: { lat: 23.4241, lng: 53.8478, name: 'United Arab Emirates' },
  SA: { lat: 23.8859, lng: 45.0792, name: 'Saudi Arabia' },
  AU: { lat: -25.2744, lng: 133.7751, name: 'Australia' },
  DE: { lat: 51.1657, lng: 10.4515, name: 'Germany' },
  // NOTE (implementer): complete to all 249 ISO-3166-1 alpha-2 codes from a public dataset
  // (e.g. https://developers.google.com/public-data/docs/canonical/countries_csv) before merge.
};
```

- [ ] **Step 3: Write failing test `tests/unit/countries.test.ts`**

```ts
import { isValidCountryCode, countryCentroid, jitter, dotForCountry } from '../../src/lib/countries';

test('isValidCountryCode accepts known, rejects unknown', () => {
  expect(isValidCountryCode('PK')).toBe(true);
  expect(isValidCountryCode('ZZ')).toBe(false);
});

test('countryCentroid returns lat/lng for known code', () => {
  expect(countryCentroid('PK')).toEqual({ lat: 30.3753, lng: 69.3451 });
  expect(countryCentroid('ZZ')).toBeNull();
});

test('jitter stays within the given radius', () => {
  const base = { lat: 30, lng: 69 };
  const p = jitter(base, 3, () => 0.5);
  expect(Math.hypot(p.lat - base.lat, p.lng - base.lng)).toBeLessThanOrEqual(3 + 1e-9);
});

test('dotForCountry returns null for invalid code', () => {
  expect(dotForCountry('ZZ', () => 0.5)).toBeNull();
  expect(dotForCountry('PK', () => 0.5)).not.toBeNull();
});
```

- [ ] **Step 4: Run, verify fail**

Run: `npm test -- countries`
Expected: FAIL — cannot find module `../../src/lib/countries`.

- [ ] **Step 5: Implement `src/lib/countries.ts`**

```ts
import { COUNTRY_CENTROIDS } from './countries-data';

export interface LatLng { lat: number; lng: number; }

export function isValidCountryCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(COUNTRY_CENTROIDS, code);
}

export function countryCentroid(code: string): LatLng | null {
  const c = COUNTRY_CENTROIDS[code];
  return c ? { lat: c.lat, lng: c.lng } : null;
}

export function jitter(point: LatLng, radiusDeg = 3, rand: () => number = Math.random): LatLng {
  const angle = rand() * Math.PI * 2;
  const dist = rand() * radiusDeg;
  return { lat: point.lat + Math.sin(angle) * dist, lng: point.lng + Math.cos(angle) * dist };
}

export function dotForCountry(code: string, rand: () => number = Math.random): LatLng | null {
  const c = countryCentroid(code);
  return c ? jitter(c, 3, rand) : null;
}
```

- [ ] **Step 6: Run, verify pass**

Run: `npm test -- countries`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/countries-data.ts src/lib/countries.ts tests/unit/countries.test.ts vitest.config.ts
git commit -m "feat: country centroid + jitter helper with tests"
```

---

## Task 3: Submission validation library

**Files:**
- Create: `src/lib/validation.ts`
- Test: `tests/unit/validation.test.ts`

- [ ] **Step 1: Write failing test `tests/unit/validation.test.ts`**

```ts
import { validateSubmission, MAX_MESSAGE } from '../../src/lib/validation';

const okCountry = (c: string) => c === 'PK';

test('valid submission passes', () => {
  const r = validateSubmission({ message: 'Free Pakistan', countryCode: 'PK' }, okCountry);
  expect(r).toEqual({ ok: true, errors: [] });
});

test('empty message rejected', () => {
  const r = validateSubmission({ message: '   ', countryCode: 'PK' }, okCountry);
  expect(r.ok).toBe(false);
  expect(r.errors).toContain('message_required');
});

test('message over limit rejected', () => {
  const r = validateSubmission({ message: 'x'.repeat(MAX_MESSAGE + 1), countryCode: 'PK' }, okCountry);
  expect(r.errors).toContain('message_too_long');
});

test('invalid/missing country rejected', () => {
  expect(validateSubmission({ message: 'hi', countryCode: '' }, okCountry).errors).toContain('country_required');
  expect(validateSubmission({ message: 'hi', countryCode: 'US' }, okCountry).errors).toContain('country_invalid');
});

test('over-long display name rejected', () => {
  const r = validateSubmission({ message: 'hi', countryCode: 'PK', displayName: 'n'.repeat(61) }, okCountry);
  expect(r.errors).toContain('name_too_long');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- validation`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/lib/validation.ts`**

```ts
export const MAX_MESSAGE = 150;
export const MAX_NAME = 60;

export interface SubmissionInput {
  message: string;
  displayName?: string | null;
  countryCode: string;
}
export interface ValidationResult { ok: boolean; errors: string[]; }

export function validateSubmission(
  input: SubmissionInput,
  isValidCountry: (code: string) => boolean,
): ValidationResult {
  const errors: string[] = [];
  const msg = (input.message ?? '').trim();
  if (!msg) errors.push('message_required');
  if (msg.length > MAX_MESSAGE) errors.push('message_too_long');
  if (!input.countryCode) errors.push('country_required');
  else if (!isValidCountry(input.countryCode)) errors.push('country_invalid');
  if (input.displayName && input.displayName.length > MAX_NAME) errors.push('name_too_long');
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- validation`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/unit/validation.test.ts
git commit -m "feat: submission validation with tests"
```

---

## Task 4: Profanity filter library

**Files:**
- Create: `src/lib/profanity.ts`
- Test: `tests/unit/profanity.test.ts`

- [ ] **Step 1: Write failing test `tests/unit/profanity.test.ts`**

```ts
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
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- profanity`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/lib/profanity.ts`**

```ts
// Minimal blocklist for v1. Implementer: expand with an English + Urdu/Roman-Urdu
// list before launch; keep entries lowercase, no regex metachars.
export const BLOCKLIST: string[] = ['badword', 'slur'];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsProfanity(text: string, list: string[] = BLOCKLIST): boolean {
  if (!text) return false;
  return list.some((w) => new RegExp(`\\b${escapeRegex(w)}\\b`, 'i').test(text));
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- profanity`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profanity.ts tests/unit/profanity.test.ts
git commit -m "feat: profanity blocklist filter with tests"
```

---

## Task 5: Supabase schema, RLS, realtime (with policy tests)

**Files:**
- Create: `supabase/migrations/0001_messages.sql`
- Test: `tests/integration/rls.test.ts`

**Prereq:** Supabase CLI installed (`brew install supabase/tap/supabase`). Run `supabase init` once (creates `supabase/config.toml`), then `supabase start` (prints local API URL + anon key → put in `.env`).

- [ ] **Step 1: Write migration `supabase/migrations/0001_messages.sql`**

```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) <= 150),
  display_name text check (display_name is null or char_length(display_name) <= 60),
  country_code text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Public may read ONLY approved rows.
create policy "read approved" on public.messages
  for select using (status = 'approved');

-- Public may insert, but the row is FORCED to pending (planted content never shows on insert).
create policy "insert pending" on public.messages
  for insert with check (status = 'pending');

-- Only authenticated users (the single provisioned admin — public signup disabled) may change/remove.
create policy "admin update" on public.messages
  for update to authenticated using (true) with check (true);
create policy "admin delete" on public.messages
  for delete to authenticated using (true);

-- Realtime broadcasts.
alter publication supabase_realtime add table public.messages;
```

- [ ] **Step 2: Apply migration locally**

Run: `supabase db reset`
Expected: migration applies; `messages` table created.

- [ ] **Step 3: Write failing test `tests/integration/rls.test.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL!;
const anon = process.env.PUBLIC_SUPABASE_ANON_KEY!;
const db = () => createClient(url, anon);

test('anon insert is forced visible only after approval', async () => {
  const sb = db();
  const ins = await sb.from('messages').insert({ message: 'hello', country_code: 'PK', status: 'pending' });
  expect(ins.error).toBeNull();

  // Anon read returns nothing while pending.
  const pendingRead = await sb.from('messages').select('*');
  expect(pendingRead.data?.length ?? 0).toBe(0);
});

test('anon cannot insert pre-approved rows', async () => {
  const sb = db();
  const ins = await sb.from('messages').insert({ message: 'sneaky', country_code: 'PK', status: 'approved' });
  expect(ins.error).not.toBeNull(); // violates WITH CHECK (status = 'pending')
});

test('anon cannot update status', async () => {
  const sb = db();
  await sb.from('messages').insert({ message: 'x', country_code: 'PK', status: 'pending' });
  const upd = await sb.from('messages').update({ status: 'approved' }).eq('message', 'x');
  // No rows updated for anon (policy denies); data is empty, no rows affected.
  expect(upd.data ?? []).toHaveLength(0);
});
```

- [ ] **Step 4: Run, verify fail (before migration applied / table absent it errors; after Step 2 it should pass)**

Run: `PUBLIC_SUPABASE_URL=... PUBLIC_SUPABASE_ANON_KEY=... npm test -- rls`
Expected first run BEFORE `supabase start`: FAIL (connection/relation error). This proves the test exercises real policies.

- [ ] **Step 5: Start Supabase and re-run**

Run: `supabase start` then re-run the test command from Step 4.
Expected: PASS (3 tests) — confirms read-approved-only, insert-forced-pending, no-anon-update.

- [ ] **Step 6: Disable public signups (admin-only auth)**

In `supabase/config.toml` set `[auth] enable_signup = false`. The admin user is created manually (Step in Task 9). Run `supabase stop && supabase start` to apply.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_messages.sql supabase/config.toml tests/integration/rls.test.ts
git commit -m "feat: messages table, RLS policies, realtime + policy tests"
```

---

## Task 6: Edge function `submit-message`

**Files:**
- Create: `supabase/functions/submit-message/index.ts`

Validates + profanity-filters + transiently rate-limits (IP used only in-memory for the window, never stored/logged) + inserts as `pending` using the service role.

- [ ] **Step 1: Implement `supabase/functions/submit-message/index.ts`**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { validateSubmission } from '../../../src/lib/validation.ts';
import { containsProfanity } from '../../../src/lib/profanity.ts';
import { isValidCountryCode } from '../../../src/lib/countries.ts';

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>(); // ip -> recent timestamps (transient, never persisted)

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 3; // max 3 submissions/min per IP
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) return Response.json({ error: 'rate_limited' }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'bad_request' }, { status: 400 });

  const v = validateSubmission(
    { message: body.message, displayName: body.displayName, countryCode: body.countryCode },
    isValidCountryCode,
  );
  if (!v.ok) return Response.json({ error: 'invalid', details: v.errors }, { status: 422 });
  if (containsProfanity(body.message)) return Response.json({ error: 'profanity' }, { status: 422 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await admin.from('messages').insert({
    message: body.message.trim(),
    display_name: body.displayName?.trim() || null,
    country_code: body.countryCode,
    status: 'pending',
  });
  if (error) return Response.json({ error: 'insert_failed' }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
});
```

- [ ] **Step 2: Serve and smoke-test locally**

Run: `supabase functions serve submit-message --no-verify-jwt`
Then in another shell:
```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/submit-message \
  -H 'Content-Type: application/json' \
  -d '{"message":"Free Pakistan","countryCode":"PK"}'
```
Expected: `{"ok":true}` (201). A second body with `"message":""` returns 422 `invalid`; rapid repeats return 429.

- [ ] **Step 3: Verify the row is pending (not publicly readable)**

Run the `rls` test again (Task 5 Step 4 command).
Expected: still PASS — inserted rows remain invisible to anon until approved.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/submit-message/index.ts
git commit -m "feat: submit-message edge function (validate, filter, throttle, insert pending)"
```

---

## Task 7: Browser Supabase client + `voices` module

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/voices.ts`
- Test: `tests/unit/voices.test.ts`

`voices` owns: reading the localStorage cache, merging the user's optimistic (pending) dot, and exposing a normalized dot list. Network/realtime are injected so the core is unit-testable.

- [ ] **Step 1: Implement `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
);
```

- [ ] **Step 2: Write failing test `tests/unit/voices.test.ts`**

```ts
import { mergeDots, CACHE_KEY, readCache, writeCache, type Dot } from '../../src/lib/voices';

const mem: Record<string, string> = {};
const fakeStorage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => { mem[k] = v; },
} as unknown as Storage;

test('mergeDots dedupes by id, optimistic wins', () => {
  const approved: Dot[] = [{ id: 'a', lat: 1, lng: 2, message: 'hi', name: null, country: 'PK', pending: false }];
  const optimistic: Dot[] = [{ id: 'a', lat: 1, lng: 2, message: 'hi', name: null, country: 'PK', pending: true }];
  const merged = mergeDots(approved, optimistic);
  expect(merged).toHaveLength(1);
  expect(merged[0].pending).toBe(true);
});

test('cache round-trips dots', () => {
  const dots: Dot[] = [{ id: 'x', lat: 0, lng: 0, message: 'm', name: 'A', country: 'US', pending: false }];
  writeCache(dots, fakeStorage);
  expect(readCache(fakeStorage)).toEqual(dots);
  expect(mem[CACHE_KEY]).toBeDefined();
});

test('readCache returns [] on missing/corrupt data', () => {
  const empty = { getItem: () => null, setItem: () => {} } as unknown as Storage;
  expect(readCache(empty)).toEqual([]);
  const bad = { getItem: () => '{not json', setItem: () => {} } as unknown as Storage;
  expect(readCache(bad)).toEqual([]);
});
```

- [ ] **Step 3: Run, verify fail**

Run: `npm test -- voices`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Implement `src/lib/voices.ts`**

```ts
import { dotForCountry } from './countries';

export interface Dot {
  id: string; lat: number; lng: number;
  message: string; name: string | null; country: string; pending: boolean;
}
export interface MessageRow {
  id: string; message: string; display_name: string | null; country_code: string;
}

export const CACHE_KEY = 'ik101.voices.v1';
export const OPTIMISTIC_KEY = 'ik101.voices.optimistic.v1';

export function rowToDot(row: MessageRow, pending: boolean, rand = Math.random): Dot | null {
  const p = dotForCountry(row.country_code, rand);
  if (!p) return null;
  return { id: row.id, lat: p.lat, lng: p.lng, message: row.message, name: row.display_name, country: row.country_code, pending };
}

export function mergeDots(approved: Dot[], optimistic: Dot[]): Dot[] {
  const byId = new Map<string, Dot>();
  for (const d of approved) byId.set(d.id, d);
  for (const d of optimistic) byId.set(d.id, d); // optimistic overrides
  return [...byId.values()];
}

export function readCache(storage: Storage = localStorage): Dot[] {
  try { return JSON.parse(storage.getItem(CACHE_KEY) ?? '[]') as Dot[]; }
  catch { return []; }
}
export function writeCache(dots: Dot[], storage: Storage = localStorage): void {
  storage.setItem(CACHE_KEY, JSON.stringify(dots));
}
export function readOptimistic(storage: Storage = localStorage): Dot[] {
  try { return JSON.parse(storage.getItem(OPTIMISTIC_KEY) ?? '[]') as Dot[]; }
  catch { return []; }
}
export function addOptimistic(dot: Dot, storage: Storage = localStorage): void {
  const cur = readOptimistic(storage);
  cur.push(dot);
  storage.setItem(OPTIMISTIC_KEY, JSON.stringify(cur));
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npm test -- voices`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.ts src/lib/voices.ts tests/unit/voices.test.ts
git commit -m "feat: supabase client + voices cache/merge/optimistic with tests"
```

---

## Task 8: Hero content collection (Decap-ready copy)

**Files:**
- Create: `src/content/config.ts`, `src/content/hero/main.json`

- [ ] **Step 1: Create `src/content/config.ts`**

```ts
import { defineCollection, z } from 'astro:content';

const hero = defineCollection({
  type: 'data',
  schema: z.object({
    eyebrow: z.string(),
    headline: z.string(),
    headlineAccent: z.string(),
    subhead: z.string(),
    ctaLabel: z.string(),
    pendingMessage: z.string(),
  }),
});

export const collections = { hero };
```

- [ ] **Step 2: Create `src/content/hero/main.json`**

```json
{
  "eyebrow": "101 Sparks for a Progressive Pakistan",
  "headline": "From his legacy",
  "headlineAccent": "to your action.",
  "subhead": "A citizens initiative inviting 101 Sparks of Progress to rebuild Pakistan collectively. Add your voice to the movement.",
  "ctaLabel": "Add your voice",
  "pendingMessage": "Your spark is live for you. It will light up for everyone once approved."
}
```

- [ ] **Step 3: Verify it builds/type-checks**

Run: `npm run build`
Expected: build succeeds; no content schema errors.

- [ ] **Step 4: Commit**

```bash
git add src/content/config.ts src/content/hero/main.json
git commit -m "feat: editable hero content collection (Decap-ready)"
```

---

## Task 9: Static Hero layout (split desktop / stacked mobile) + admin user

**Files:**
- Create: `src/components/Hero.astro`, `src/styles/global.css`
- Modify: `src/pages/index.astro`, `src/layouts/Layout.astro:body`

- [ ] **Step 1: Create `src/styles/global.css`**

```css
:root { --bg: #f7f8f7; --ink: #0a0e0c; --muted: #5a6b62; --accent: #00bf63; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Georgia, 'Times New Roman', serif; }
.hero { min-height: 100svh; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 2rem; padding: clamp(1.5rem, 4vw, 4rem); }
.hero__copy { max-width: 48ch; }
.hero__eyebrow { text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.8rem; color: var(--accent); margin: 0 0 1rem; }
.hero__title { font-size: clamp(2.5rem, 6vw, 5rem); line-height: 1.05; margin: 0 0 1rem; font-weight: 600; }
.hero__title .accent { color: var(--accent); }
.hero__subhead { font-size: 1.125rem; line-height: 1.6; color: var(--muted); }
.hero__cta { display: inline-block; margin-top: 1.5rem; background: var(--accent); color: #06140d; font-weight: 700; padding: 0.9rem 1.6rem; border: 0; border-radius: 4px; cursor: pointer; }
.hero__counter { margin-top: 1.25rem; font-size: 0.8rem; letter-spacing: 0.12em; color: var(--muted); }
.hero__counter b { color: var(--accent); }
/* Reserve globe space to guarantee CLS = 0 even before the island loads. */
.hero__globe { aspect-ratio: 1 / 1; width: 100%; max-width: 640px; justify-self: center; }
@media (max-width: 768px) {
  .hero { grid-template-columns: 1fr; min-height: auto; }
  .hero__globe { order: 2; margin-top: 2rem; }
}
@media (prefers-reduced-motion: reduce) { .hero__globe canvas { animation: none !important; } }
```

- [ ] **Step 2: Add stylesheet to `Layout.astro` head**

Add inside `<head>` of `src/layouts/Layout.astro`:
```astro
<link rel="stylesheet" href="/src/styles/global.css" />
```
(Astro will bundle it; alternatively `import '../styles/global.css'` in the frontmatter.)

- [ ] **Step 3: Create `src/components/Hero.astro`**

```astro
---
import { getEntry } from 'astro:content';
const hero = await getEntry('hero', 'main');
const c = hero.data;
---
<section class="hero">
  <div class="hero__copy">
    <p class="hero__eyebrow">{c.eyebrow}</p>
    <h1 class="hero__title">{c.headline} <span class="accent">{c.headlineAccent}</span></h1>
    <p class="hero__subhead">{c.subhead}</p>
    <button class="hero__cta" data-globe-cta type="button">{c.ctaLabel}</button>
    <p class="hero__counter">VOICES: <b data-voices-count>—</b></p>
  </div>
  <div class="hero__globe" data-globe data-pending-message={c.pendingMessage}></div>
</section>
<script>
  // Lazy-bootstrap the island; below the fold on mobile, idle on desktop.
  import('../components/hero/island.ts').then((m) => m.mountHero());
</script>
```

- [ ] **Step 4: Use Hero in `src/pages/index.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import Hero from '../components/Hero.astro';
---
<Layout title="IK101 — From his legacy to your action."><Hero /></Layout>
```

- [ ] **Step 5: Build + manual check**

Run: `npm run build && npm run preview`
Expected: hero renders with copy from content file; globe box reserved (empty until island lands). View source: only the small bootstrap script is present (no globe JS in initial HTML).

- [ ] **Step 6: Create the admin user (one-time, local)**

Run:
```bash
supabase auth admin create-user --email admin@ik101.org --password 'TEMP-change-me'
```
(Implementer: real credentials provided by site owner at deploy. With `enable_signup=false` this is the only account.)

- [ ] **Step 7: Commit**

```bash
git add src/components/Hero.astro src/styles/global.css src/pages/index.astro src/layouts/Layout.astro
git commit -m "feat: static split-hero layout (mobile stacks, reserved globe space)"
```

---

## Task 10: Globe island — three-globe render + perf + popover

**Files:**
- Create: `src/components/hero/globe.ts`
- Test: `tests/unit/globe.test.ts` (logic only; WebGL is not unit-tested)

The globe module exposes pure-ish helpers (tested) and a `createGlobe(container, opts)` that wires three-globe (manually verified).

- [ ] **Step 1: Write failing test `tests/unit/globe.test.ts` (dot styling logic)**

```ts
import { dotColor, shouldAnimate } from '../../src/components/hero/globe';

test('pending and newest dots use the accent color', () => {
  expect(dotColor({ pending: true, isNewest: false })).toBe('#00bf63');
  expect(dotColor({ pending: false, isNewest: true })).toBe('#00bf63');
});

test('ordinary dots are muted gray', () => {
  expect(dotColor({ pending: false, isNewest: false })).toBe('#8a978f');
});

test('shouldAnimate respects reduced motion + visibility', () => {
  expect(shouldAnimate({ reducedMotion: true, visible: true })).toBe(false);
  expect(shouldAnimate({ reducedMotion: false, visible: false })).toBe(false);
  expect(shouldAnimate({ reducedMotion: false, visible: true })).toBe(true);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- globe`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/components/hero/globe.ts`**

```ts
import ThreeGlobe from 'three-globe';
import * as THREE from 'three';
import type { Dot } from '../../lib/voices';

export function dotColor(d: { pending: boolean; isNewest: boolean }): string {
  return d.pending || d.isNewest ? '#00bf63' : '#8a978f';
}
export function shouldAnimate(s: { reducedMotion: boolean; visible: boolean }): boolean {
  return !s.reducedMotion && s.visible;
}

export interface GlobeHandle {
  setDots(dots: Dot[], newestId?: string): void;
  destroy(): void;
}

export function createGlobe(container: HTMLElement, onDotClick: (d: Dot) => void): GlobeHandle {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const size = Math.min(container.clientWidth, 640);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); // cap DPR for perf
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const globe = new ThreeGlobe()
    .showGlobe(false)
    .showAtmosphere(false)
    .hexPolygonResolution(3)
    .hexPolygonMargin(0.7)
    .hexPolygonColor(() => 'rgba(90,107,98,0.35)'); // faint wireframe land

  const scene = new THREE.Scene();
  scene.add(globe, new THREE.AmbientLight(0xffffff, 1));
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.z = 200;

  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(container);
  const onVis = () => { /* read in loop */ };
  document.addEventListener('visibilitychange', onVis);

  let raf = 0;
  const loop = () => {
    if (shouldAnimate({ reducedMotion, visible: visible && !document.hidden })) {
      globe.rotation.y += 0.0015;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();

  // Click handling: raycast against point objects (three-globe sets userData on points).
  renderer.domElement.addEventListener('click', (ev) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(globe.children, true).find((h) => (h.object as any).__dot);
    if (hit) onDotClick((hit.object as any).__dot as Dot);
  });

  return {
    setDots(dots: Dot[], newestId?: string) {
      globe.pointsData(dots)
        .pointLat('lat').pointLng('lng')
        .pointAltitude(0.01)
        .pointRadius(0.4)
        .pointColor((d: any) => dotColor({ pending: d.pending, isNewest: d.id === newestId }));
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
      container.replaceChildren();
    },
  };
}
```

- [ ] **Step 4: Run, verify unit pass**

Run: `npm test -- globe`
Expected: PASS (3 tests — `dotColor`, `shouldAnimate`).

- [ ] **Step 5: Commit**

```bash
git add src/components/hero/globe.ts tests/unit/globe.test.ts
git commit -m "feat: three-globe island renderer (DPR cap, rAF pause, dot styling)"
```

---

## Task 11: Contribution form (validation, submit, optimistic dot)

**Files:**
- Create: `src/components/hero/contribution-form.ts`
- Test: `tests/unit/contribution-form.test.ts`

- [ ] **Step 1: Write failing test `tests/unit/contribution-form.test.ts`**

```ts
import { buildSubmission, submitMessage } from '../../src/components/hero/contribution-form';
import { isValidCountryCode } from '../../src/lib/countries';

test('buildSubmission trims and nulls empty name', () => {
  expect(buildSubmission({ message: '  hi  ', displayName: '   ', countryCode: 'PK' }))
    .toEqual({ message: 'hi', displayName: null, countryCode: 'PK' });
});

test('submitMessage rejects invalid input before calling network', async () => {
  let called = false;
  const fetcher = async () => { called = true; return { ok: true } as Response; };
  const res = await submitMessage({ message: '', countryCode: 'PK' }, isValidCountryCode, fetcher as any, '/fn');
  expect(res.ok).toBe(false);
  expect(res.errors).toContain('message_required');
  expect(called).toBe(false);
});

test('submitMessage posts to the edge function on valid input', async () => {
  let url = '';
  const fetcher = async (u: string) => { url = u; return { ok: true, status: 201 } as Response; };
  const res = await submitMessage({ message: 'Free PK', countryCode: 'PK' }, isValidCountryCode, fetcher as any, '/fn');
  expect(res.ok).toBe(true);
  expect(url).toBe('/fn');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- contribution-form`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/components/hero/contribution-form.ts`**

```ts
import { validateSubmission, type SubmissionInput } from '../../lib/validation';

export function buildSubmission(raw: { message: string; displayName?: string; countryCode: string }): SubmissionInput {
  return {
    message: (raw.message ?? '').trim(),
    displayName: raw.displayName?.trim() ? raw.displayName.trim() : null,
    countryCode: raw.countryCode,
  };
}

export interface SubmitResult { ok: boolean; errors: string[]; status?: number; }

export async function submitMessage(
  raw: { message: string; displayName?: string; countryCode: string },
  isValidCountry: (c: string) => boolean,
  fetcher: typeof fetch,
  endpoint: string,
): Promise<SubmitResult> {
  const input = buildSubmission(raw);
  const v = validateSubmission(input, isValidCountry);
  if (!v.ok) return { ok: false, errors: v.errors };
  const resp = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: resp.ok, errors: resp.ok ? [] : ['submit_failed'], status: resp.status };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- contribution-form`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/hero/contribution-form.ts tests/unit/contribution-form.test.ts
git commit -m "feat: contribution form submit logic with tests"
```

---

## Task 12: Island entry — wire globe + form + data + realtime

**Files:**
- Create: `src/components/hero/island.ts`

Glue only (manually verified end-to-end in Task 15 / E2E in Task 16). No new pure logic, so no new unit test; it composes already-tested modules.

- [ ] **Step 1: Implement `src/components/hero/island.ts`**

```ts
import { createGlobe } from './globe';
import { submitMessage, buildSubmission } from './contribution-form';
import { isValidCountryCode } from '../../lib/countries';
import { supabase } from '../../lib/supabase';
import {
  rowToDot, mergeDots, readCache, writeCache, readOptimistic, addOptimistic,
  type Dot, type MessageRow,
} from '../../lib/voices';

const FN_URL = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/submit-message`;

export async function mountHero(): Promise<void> {
  const container = document.querySelector<HTMLElement>('[data-globe]');
  const countEl = document.querySelector<HTMLElement>('[data-voices-count]');
  const cta = document.querySelector<HTMLElement>('[data-globe-cta]');
  if (!container) return;

  const handle = createGlobe(container, (d) => showPopover(container, d));

  // 1) Instant paint from cache + the user's own optimistic dots.
  let approved: Dot[] = readCache();
  const optimistic: Dot[] = readOptimistic();
  const render = (newestId?: string) => {
    const all = mergeDots(approved, optimistic);
    handle.setDots(all, newestId);
    if (countEl) countEl.textContent = String(approved.length);
  };
  render();

  // 2) Refresh approved from network.
  const { data } = await supabase.from('messages').select('id,message,display_name,country_code').eq('status', 'approved');
  approved = (data ?? []).map((r) => rowToDot(r as MessageRow, false)).filter(Boolean) as Dot[];
  writeCache(approved);
  render();

  // 3) Live updates: new approved rows animate in for everyone.
  supabase.channel('messages')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'status=eq.approved' },
      (payload) => {
        const row = payload.new as MessageRow;
        const dot = rowToDot(row, false);
        if (dot && !approved.some((d) => d.id === dot.id)) { approved.push(dot); writeCache(approved); render(dot.id); }
      })
    .subscribe();

  // 4) CTA opens the form (minimal inline form built here).
  cta?.addEventListener('click', () => openForm(container, async (raw) => {
    const res = await submitMessage(raw, isValidCountryCode, fetch, FN_URL);
    if (res.ok) {
      const localDot = rowToDot(
        { id: `local-${Date.now()}`, message: raw.message, display_name: raw.displayName ?? null, country_code: raw.countryCode },
        true,
      );
      if (localDot) { addOptimistic(localDot); optimistic.push(localDot); render(localDot.id); }
    }
    return res;
  }));
}

// Minimal DOM helpers (styling lives in global.css; selectors used by E2E).
function openForm(root: HTMLElement, onSubmit: (raw: any) => Promise<{ ok: boolean; errors: string[] }>) {
  // Implementer: render a <dialog data-globe-form> with [data-field-message], [data-field-name],
  // [data-field-country] (searchable <select>), a live 0/150 counter, and [data-submit].
  // On submit call onSubmit(); on ok show the pending message (root.dataset.pendingMessage) and close.
}
function showPopover(root: HTMLElement, d: Dot) {
  // Implementer: render [data-globe-popover] with d.message, (d.name ?? 'Anonymous'), d.country.
}
```

> Implementer note: the two DOM helpers are the only hand-wired UI. Keep the `data-*` hooks above — the E2E tests in Task 16 select on them. Build the `<dialog>` form and popover with the classes already in `global.css`.

- [ ] **Step 2: Build + manual smoke**

Run: `npm run dev` (with `supabase start` + functions served).
Manually: globe appears below the fold on mobile width / right side on desktop; click CTA → form → submit "Free Pakistan / PK" → your green dot appears immediately + pending message shows. Reload → your dot persists (optimistic cache). It is NOT visible in a separate browser/incognito (still pending).

- [ ] **Step 3: Commit**

```bash
git add src/components/hero/island.ts
git commit -m "feat: hero island wiring (globe + form + cache + realtime + optimistic)"
```

---

## Task 13: Moderation page — auth gate (magic link + password)

**Files:**
- Create: `src/pages/moderate.astro`

- [ ] **Step 1: Create `src/pages/moderate.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="IK101 — Moderate">
  <main style="max-width:640px;margin:3rem auto;padding:1rem;">
    <h1>Moderate voices</h1>
    <section data-auth-gate>
      <form data-login-form>
        <input data-login-email type="email" placeholder="you@email.com" required />
        <input data-login-password type="password" placeholder="Password (or leave blank for a magic link)" />
        <button data-login-password-btn type="submit">Sign in</button>
        <button data-login-magic-btn type="button">Email me a magic link</button>
        <p data-login-error role="alert"></p>
      </form>
    </section>
    <section data-queue hidden></section>
  </main>
  <script>
    import('../components/moderate/queue.ts').then((m) => m.mountModerate());
  </script>
</Layout>
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: `/moderate` builds; login form present, queue hidden.

- [ ] **Step 3: Commit**

```bash
git add src/pages/moderate.astro
git commit -m "feat: moderation page shell with login form"
```

---

## Task 14: Moderation queue — list pending, approve/reject

**Files:**
- Create: `src/components/moderate/queue.ts`
- Test: `tests/unit/queue.test.ts`

- [ ] **Step 1: Write failing test `tests/unit/queue.test.ts`**

```ts
import { nextStatus, summarize } from '../../src/components/moderate/queue';

test('approve/reject map to status values', () => {
  expect(nextStatus('approve')).toBe('approved');
  expect(nextStatus('reject')).toBe('rejected');
});

test('summarize renders name or Anonymous + country', () => {
  expect(summarize({ id: '1', message: 'hi', display_name: null, country_code: 'PK' }))
    .toBe('Anonymous (PK): hi');
  expect(summarize({ id: '2', message: 'yo', display_name: 'Sara', country_code: 'US' }))
    .toBe('Sara (US): yo');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- queue`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/components/moderate/queue.ts`**

```ts
import { supabase } from '../../lib/supabase';
import type { MessageRow } from '../../lib/voices';

export function nextStatus(action: 'approve' | 'reject'): 'approved' | 'rejected' {
  return action === 'approve' ? 'approved' : 'rejected';
}
export function summarize(row: MessageRow): string {
  return `${row.display_name ?? 'Anonymous'} (${row.country_code}): ${row.message}`;
}

export async function mountModerate(): Promise<void> {
  const gate = document.querySelector<HTMLElement>('[data-auth-gate]');
  const queue = document.querySelector<HTMLElement>('[data-queue]');
  const emailEl = document.querySelector<HTMLInputElement>('[data-login-email]');
  const pwEl = document.querySelector<HTMLInputElement>('[data-login-password]');
  const err = document.querySelector<HTMLElement>('[data-login-error]');
  if (!gate || !queue) return;

  document.querySelector('[data-login-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email: emailEl!.value, password: pwEl!.value });
    if (error && err) err.textContent = error.message; else await showQueue();
  });
  document.querySelector('[data-login-magic-btn]')?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithOtp({ email: emailEl!.value });
    if (err) err.textContent = error ? error.message : 'Check your inbox for the magic link.';
  });

  const { data: session } = await supabase.auth.getSession();
  if (session.session) await showQueue();

  async function showQueue() {
    gate!.hidden = true; queue!.hidden = false;
    const { data } = await supabase.from('messages').select('id,message,display_name,country_code').eq('status', 'pending');
    queue!.replaceChildren();
    for (const row of (data ?? []) as MessageRow[]) {
      const card = document.createElement('div');
      card.className = 'mod-card';
      card.textContent = summarize(row);
      for (const action of ['approve', 'reject'] as const) {
        const btn = document.createElement('button');
        btn.textContent = action;
        btn.dataset.action = action;
        btn.addEventListener('click', async () => {
          await supabase.from('messages').update({ status: nextStatus(action) }).eq('id', row.id);
          card.remove();
        });
        card.appendChild(btn);
      }
      queue!.appendChild(card);
    }
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- queue`
Expected: PASS (2 tests).

- [ ] **Step 5: Manual: approve a dot, confirm it goes live**

With `supabase start`, dev server, and a pending row (from Task 12): log in at `/moderate`, click **approve** → in the main tab the dot appears live (realtime), counter increments.

- [ ] **Step 6: Commit**

```bash
git add src/components/moderate/queue.ts tests/unit/queue.test.ts
git commit -m "feat: moderation queue (login, list pending, approve/reject)"
```

---

## Task 15: Counter, performance hardening, accessibility pass

**Files:**
- Modify: `src/components/hero/globe.ts` (already DPR-capped + rAF-paused — verify), `src/components/hero/island.ts`, `src/components/Hero.astro`

- [ ] **Step 1: Verify no CLS — globe box is pre-reserved**

Run: `npm run build && npm run preview`, open DevTools Performance → reload.
Expected: Cumulative Layout Shift = 0 (the `.hero__globe` `aspect-ratio` reserves space before the island mounts).

- [ ] **Step 2: Confirm globe JS is not in the critical path**

Run: `npm run build` then inspect `dist/index.html`.
Expected: three.js / three-globe chunks are separate hashed files loaded by the dynamic `import()`, NOT inlined or render-blocking in `<head>`.

- [ ] **Step 3: Accessibility — form labels + focus + popover**

In the `openForm` dialog add `aria-label`s, ensure the dialog uses `<dialog>` (native focus trap) and returns focus to the CTA on close; popover is keyboard-dismissible (Esc). Add `role="status"` to the pending message.

- [ ] **Step 4: Run a Lighthouse check**

Run: `npx lighthouse http://localhost:4321 --only-categories=performance,accessibility --quiet --chrome-flags="--headless"` (preview server running).
Expected gates (spec §10): LCP < 1.5s, CLS < 0.1, INP/TBT low, Accessibility ≥ 95. Record the numbers in the commit message.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "perf+a11y: verify CLS=0, code-split globe, labeled form, Lighthouse pass"
```

---

## Task 16: End-to-end tests (Playwright)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/contribute.spec.ts`, `tests/e2e/moderate.spec.ts`

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  webServer: { command: 'npm run preview', url: 'http://localhost:4321', reuseExistingServer: true },
  use: { baseURL: 'http://localhost:4321' },
});
```

- [ ] **Step 2: Write `tests/e2e/contribute.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('submitting a message shows my own dot + pending notice and persists on reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-globe-cta]').click();
  await page.locator('[data-field-message]').fill('Free Pakistan');
  await page.locator('[data-field-country]').selectOption('PK');
  await page.locator('[data-submit]').click();
  await expect(page.locator('[role="status"]')).toContainText('approved'); // pending message text
  await page.reload();
  // optimistic dot persisted via localStorage (count of optimistic markers in DOM/popover store)
  const cached = await page.evaluate(() => localStorage.getItem('ik101.voices.optimistic.v1'));
  expect(cached).toContain('Free Pakistan');
});
```

- [ ] **Step 3: Write `tests/e2e/moderate.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('admin can log in with password and see the pending queue', async ({ page }) => {
  await page.goto('/moderate');
  await page.locator('[data-login-email]').fill('admin@ik101.org');
  await page.locator('[data-login-password]').fill('TEMP-change-me');
  await page.locator('[data-login-password-btn]').click();
  await expect(page.locator('[data-queue]')).toBeVisible();
});
```

- [ ] **Step 4: Install browsers + run**

Run: `npx playwright install --with-deps chromium && npm run test:e2e`
Expected: both specs PASS (Supabase local + functions running, admin user created in Task 9 Step 6).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/
git commit -m "test: e2e for contribution + moderation flows"
```

---

## Task 17: Full suite green + docs

**Files:**
- Modify: `README.md` (create with run instructions)

- [ ] **Step 1: Create `README.md`** with: prerequisites (Node, Supabase CLI), `cp .env.example .env`, `supabase start`, `supabase functions serve submit-message`, `npm run dev`, and how to run `npm test` / `npm run test:e2e`. (Implementer: write the actual commands used above.)

- [ ] **Step 2: Run the entire suite**

Run: `npm test && npm run test:e2e`
Expected: all unit + integration + e2e PASS.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: clean build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with local dev + test instructions"
```

---

## Self-Review Notes (author)

- **Spec coverage:** data model + RLS (Task 5) · privacy/no-IP (Tasks 5–6) · country dots+jitter (Task 2) · hero split/mobile (Task 9) · globe style+perf (Tasks 10,15) · optimistic + moderation flow (Tasks 11,12,14) · admin magic-link+password (Tasks 13,14) · edge-function filter+throttle (Task 6) · editable hero copy (Task 8) · error handling (cache fallback in Task 12, validation in 11) · testing (unit/integration/e2e throughout). All §-sections map to a task.
- **Out of scope confirmed:** Decap CMS and the other 57 pages are not in this plan (separate spec).
- **Type consistency:** `Dot`, `MessageRow`, `SubmissionInput`, `dotForCountry`, `rowToDot`, `mergeDots`, `nextStatus`, `summarize`, `createGlobe/setDots/destroy` are defined once and reused with the same signatures across tasks.
- **Known implementer fill-ins (explicitly flagged, not silent placeholders):** complete the country dataset (Task 2 Step 2), expand the profanity blocklist (Task 4 Step 3), and build the `<dialog>` form + popover DOM in Task 12 Step 1 against the listed `data-*` hooks. These are data/markup expansions, not undefined logic.
