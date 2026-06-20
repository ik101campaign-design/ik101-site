# IK101 Admin Guide

How to run the site's content + moderation without touching code. One GitHub login does everything.

---

## What you can do

Go to **`<your-domain>/admin`** and sign in with GitHub. Two doors appear:

- **Edit content** — change the site's words (and later, images) through simple forms. Saving publishes automatically.
- **Moderate voices** — approve or reject the messages visitors submit to the globe.

You sign in once; both doors use the same login.

---

## One-time setup (already done at launch — kept here for reference)

### 1. GitHub OAuth App
On the **ik101campaign-design** GitHub account → Settings → Developer settings → OAuth Apps → New:
- Homepage URL: `<your-domain>`
- Authorization callback URL: `<your-domain>/callback`

Copy the **Client ID** and generate a **Client Secret**.

> If you ever change the site's domain, update the callback URL here **and** `base_url` in `public/cms/config.yml`, or login will stop working.

### 2. Cloudflare Pages variables
Pages project → Settings → Variables and Secrets (Production). Secret-sensitive ones marked 🔒 — add as encrypted secrets:

| Name | Value |
|---|---|
| `GITHUB_CLIENT_ID` | from the OAuth App |
| `GITHUB_CLIENT_SECRET` 🔒 | from the OAuth App |
| `SUPABASE_URL` | `https://qealqpuhvzpkdcqpqpvo.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` 🔒 | Supabase → Project Settings → API → `service_role` |
| `ALLOWED_GITHUB_LOGIN` | the GitHub username allowed to admin (e.g. `ik101campaign-design`) |

### 3. Cloudflare Pages build settings
- Build command: `npm run build`
- Build output directory: `dist`
- The backend (`functions/` folder) deploys automatically — no extra setup.

Pushing to the `main` branch redeploys the whole site **and** the backend.

---

## Daily use

### Editing content
1. `/admin` → **Edit content** (opens the CMS).
2. Pick a section (e.g. **Hero**), change the fields, click **Publish**.
3. The change is saved to the site's repository and goes live in ~1–2 minutes (Cloudflare rebuilds).

### Moderating voices
1. `/admin` → **Moderate voices**.
2. Each pending message shows with **approve** / **reject**.
3. **Approve** → the message's green dot appears on the public globe within seconds. **Reject** → it's hidden.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Sign-in popup opens then nothing happens | The OAuth App's **callback URL** doesn't match the domain you're on. They must be identical (`<domain>/callback`). |
| "That GitHub account is not authorized." | You signed in with a GitHub account that isn't `ALLOWED_GITHUB_LOGIN`. Sign in with the allowed account, or update that variable in Cloudflare. |
| CMS won't save / "permission" error | The signed-in GitHub account needs write access to the `ik101campaign-design/ik101-site` repository. |
| Moderation list won't load | Check the Cloudflare variables are set (especially `SUPABASE_SERVICE_ROLE_KEY`) and the latest deploy succeeded. |
| A content change didn't appear | Check the Cloudflare Pages **Deployments** tab — the latest build must show "Success." |

---

## Security notes

- The **`service_role` key** bypasses all database security and lives **only** in Cloudflare's encrypted variables — never in the website code, never in the browser, never shared in chat or email.
- Signing in gives your browser a GitHub token that can edit **only this one repository**. If a device is lost or you suspect misuse, reset the OAuth App's client secret (GitHub → the OAuth App → Generate a new client secret) and update it in Cloudflare — that invalidates old sessions.
- Only the single account in `ALLOWED_GITHUB_LOGIN` can moderate or commit. Add more editors later by extending that check (a developer task).
