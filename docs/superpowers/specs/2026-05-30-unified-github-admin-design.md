# Unified GitHub-Login Admin (CMS + Moderation) — Design Spec

**Date:** 2026-05-30
**Status:** Approved
**Scope:** Give ik101 a no-code content editor (Sveltia CMS) and fold the existing voice-moderation into a single GitHub login, behind one `/admin` dashboard. One trusted admin.

---

## 1. Goal

A non-technical operator (no Claude, no code) can: (a) edit site content through forms that commit to the repo and auto-deploy, and (b) approve/reject visitor voices — all from **one GitHub login**, via one dashboard with two doors.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Editors | **One** trusted admin (single GitHub username) |
| CMS | **Sveltia CMS** (git-based; Decap-compatible, modern) |
| Login | **GitHub OAuth** — the only auth system |
| Moderation auth | **Unified onto GitHub** (was Supabase email); gated by GitHub identity |
| Supabase Auth | **Dropped** — no admin user to provision |
| Admin layout | **One `/admin` dashboard → two doors:** Edit content (CMS) + Moderate voices |
| Backend | **Cloudflare Pages Functions** — in this same repo, auto-deploy with the site, same domain (no CORS) |

## 3. Architecture

```
Browser (same domain throughout — no CORS)
 ├── /admin .......... dashboard: "Sign in with GitHub" → two doors
 ├── /cms/ ........... Sveltia CMS (static; commits content to the repo)
 └── /moderate ....... moderation queue (calls the Functions below)

Cloudflare Pages Functions  (in functions/, deploy with the site; hold all secrets)
 ├── /auth, /callback ... GitHub OAuth relay (Sveltia + dashboard get a token)
 ├── GET  /api/pending .. verify GitHub identity → Supabase (service role) → pending list
 └── POST /api/moderate . verify GitHub identity → Supabase (service role) → set status

GitHub (ik101campaign-design/ik101-site)  ← Sveltia commits here → Cloudflare Pages rebuilds
Supabase (messages table)                 ← Functions read pending / update status (service role)
```

**One GitHub OAuth App** (registered on the account that owns the repo) backs everything. Its **Client Secret lives only in the Pages project's encrypted env**, read by the Functions.

## 4. Auth + data flow

1. **Login:** `/admin` → "Sign in with GitHub" → popup to `/auth` → GitHub authorize → `/callback` exchanges the code for a token → `postMessage`s it back (the Sveltia/Decap `authorization:github:success:{token}` handshake) → token held in the browser session (`sessionStorage`, shared across same-origin pages). The two doors appear.
2. **Edit content:** `/cms/` loads Sveltia → it obtains a token the same way (seamless if GitHub is already authorized) → commits content edits to `ik101-site` via the GitHub API → Cloudflare auto-rebuilds → live.
3. **Moderate:** `/moderate` sends the stored GitHub token to `/api/pending` and `/api/moderate` → each Function calls GitHub `/user` to confirm the login matches `ALLOWED_GITHUB_LOGIN` → on match, reads pending / updates `status` in Supabase using the **service-role key** → globe updates live (realtime).

## 5. The Pages Functions (in `functions/`, same domain as the site)

- `GET /auth` — redirect to GitHub OAuth (`client_id`, `scope=repo`, `redirect_uri=<site>/callback`, random `state`).
- `GET /callback` — exchange `code` + secret → token; return an HTML page that `postMessage`s the token to the opener in the Sveltia/Decap format, restricted to the site origin.
- `GET /api/pending` — `Authorization: Bearer <gh_token>` → verify via GitHub `/user` == `ALLOWED_GITHUB_LOGIN` → Supabase (service role) `select … where status='pending'` → JSON.
- `POST /api/moderate` — body `{ id, action: "approve"|"reject" }` → verify identity → Supabase (service role) `update messages set status=… where id=…` → `{ ok }`.

Because the Functions are same-origin with the site, **no CORS** is needed.

**Secrets (Pages project → Settings → Variables and Secrets, as *encrypted* secrets):** `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_GITHUB_LOGIN`. (`SITE_ORIGIN` isn't needed — the Function reads its own request origin.)

## 6. Sveltia CMS

- `public/cms/index.html` loads the Sveltia script; `public/cms/config.yml` configures it.
- `config.yml` (sketch):
  ```yaml
  backend:
    name: github
    repo: ik101campaign-design/ik101-site
    branch: main
    base_url: https://<your-site-domain>   # same domain; the /auth relay lives here
  media_folder: public/uploads
  public_folder: /uploads
  collections:
    - name: hero
      label: Hero
      files:
        - { name: main, label: Hero section, file: src/content/hero/main.json, fields: [
            { name: eyebrow, label: Eyebrow, widget: string },
            { name: headline, label: "Headline (line 1)", widget: string },
            { name: headlineAccent, label: "Headline (line 2)", widget: string },
            { name: subhead, label: Subheadline, widget: text },
            { name: ctaLabel, label: "Button label", widget: string },
            { name: pendingMessage, label: "After-submit message", widget: text } ] }
  ```
- The hero content collection already exists, so the CMS manages it on day one. **As future pages are built, each becomes a content collection + a `config.yml` entry — no CMS rework.**

## 7. Moderation rework

- **Before:** `/moderate` used Supabase `signInWithPassword` and client-side RLS updates.
- **After:** `/moderate` (and the dashboard's moderate door) authenticate with the **GitHub token**, and call the **Functions** for the queue + actions. The Functions do the Supabase writes with the service role.
- `queue.ts`: the pure helpers (`nextStatus`, `summarize`) are unchanged (and their 2 unit tests stay green). `mountModerate` changes from Supabase-auth + direct queries to: get GitHub token → `fetch('/api/pending')` and `fetch('/api/moderate')`.
- `moderate.astro`: the login UI changes from email/password to "Sign in with GitHub."
- **Supabase RLS:** keep `read approved` (public) and `insert pending` (anon submissions). The `authenticated`-role admin policies become unused (the Functions use the service role, which bypasses RLS) — leave them in place (harmless).

## 8. Security

- The GitHub OAuth token can write the repo (Sveltia needs that to commit). It lives in the logged-in admin's browser session — acceptable for **one trusted admin**, and **rotatable** anytime by resetting the OAuth app secret / revoking. Scope is naturally bounded if the GitHub account only has access to this one repo.
- The **Supabase service-role key never leaves the Function** (server-side env). Every moderation call is gated by the GitHub-username check.
- `state` param on OAuth to prevent CSRF; the `/callback` `postMessage` target is restricted to the site origin.
- **Hardening path (future, no rework):** swap the long-lived OAuth token for **short-lived GitHub App installation tokens** minted by the Function per session.

## 9. Components / files

| Path | Responsibility |
|---|---|
| `functions/auth.ts` (new) | OAuth redirect to GitHub |
| `functions/callback.ts` (new) | Token exchange + `postMessage` relay |
| `functions/api/pending.ts` (new) | Identity-gated pending list (service role) |
| `functions/api/moderate.ts` (new) | Identity-gated approve/reject (service role) |
| `functions/_lib/github.ts` (new) | Shared: verify a GitHub token → login; allowlist check |
| `src/pages/admin.astro` (new) | Dashboard: GitHub sign-in → two doors |
| `public/cms/index.html` + `public/cms/config.yml` (new) | Sveltia CMS |
| `src/pages/moderate.astro` (modify) | Switch login UI to GitHub |
| `src/components/moderate/queue.ts` (modify) | `mountModerate` → Functions API; keep pure helpers + tests |
| `src/lib/admin-auth.ts` (new) | Client helper: GitHub OAuth popup + token storage (`sessionStorage`) + authed `fetch` |

## 10. Error handling

- Non-allowed GitHub user → Function returns **403** → dashboard/moderation shows "not authorized."
- Token missing/expired → re-trigger sign-in.
- Function/Supabase unreachable → the moderation view shows a non-destructive error and keeps the last state; the CMS surfaces Sveltia's own commit-error UI.
- A failed deploy (bad content commit) → Cloudflare keeps the last good deploy live and shows the build log (existing behavior).

## 11. Testing

- **Unit:** `queue.ts` helpers stay covered (existing tests). Add tests for `admin-auth.ts` (token parse/store) and `functions/_lib/github.ts` (identity check / allowlist) — pure logic with `fetch` injected/mocked.
- **Function behavior:** 403 on wrong/absent identity; approve/reject hits the right Supabase update.
- **Manual/E2E:** sign in with GitHub → see two doors; edit the hero headline in the CMS → commit → Cloudflare rebuild → live; approve a pending voice → dot appears on the globe.
- The full existing suite (23 tests) must stay green.

## 12. What you set up (vs. what I build)

**You (with exact click-by-click at implementation time):**
1. Register a **GitHub OAuth App** on the account that owns `ik101-site` (homepage = the site; Authorization callback URL = `<site>/callback`).
2. In the **Pages project → Settings → Variables and Secrets**, add the secrets from §5 (OAuth client id/secret, Supabase URL + **service-role** key, your GitHub username) — entered into Cloudflare directly, never into chat.
That's it — the Functions **deploy automatically with the next `git push`** (no separate deploy).

**I build:** the Functions, the `/admin` dashboard, the Sveltia config + loader, the `admin-auth.ts` helper, and the moderation rework — then walk you through steps 1–2.

## 13. Out of scope (future)

- More content collections (added as the other ~57 pages are rebuilt from the extraction).
- Multi-editor roles / multiple accounts.
- GitHub-App short-lived-token hardening (§8).
- The submit-message edge function (separately deferred).

## 14. Confirmed at build time

- Routes: `/admin` (dashboard), `/cms/` (Sveltia), `/moderate` (moderation).
- Leave the now-unused Supabase `authenticated` RLS policies in place.
- Backend = **Cloudflare Pages Functions** in this repo (decided).
