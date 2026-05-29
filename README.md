# IK101 — Interactive Globe Hero

The public-facing site for **ik101.org** — an Astro static site with a three-globe interactive hero that lets visitors add their voice to a global movement. Messages are stored in Supabase and displayed as dots on a 3-D globe in real time.

---

## Prerequisites

- Node 20+
- A Supabase project (free tier is fine for development)

---

## Setup

1. Copy the env template and fill in your Supabase credentials:

   ```bash
   cp .env.example .env
   ```

   Set the two variables in `.env`:

   ```
   PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   ```

2. Apply the database schema. Open the Supabase dashboard → SQL Editor, paste and run the contents of:

   ```
   supabase/migrations/20260529000000_init_messages.sql
   ```

   Alternatively, use the Supabase CLI: `supabase db push`.

3. Create an admin user for the `/moderate` page. In the Supabase dashboard go to **Authentication → Users → Add user**, enter an email and password, and check **Auto Confirm**.

---

## Development

```bash
npm install
npm run dev        # starts Astro dev server at http://localhost:4321
```

## Build & Preview

```bash
npm run build      # outputs to dist/
npm run preview    # serves dist/ at http://localhost:4321
```

---

## Tests

### Unit tests (Vitest)

```bash
npm test
```

Runs 23 unit tests covering validation, profanity filtering, country helpers, voice cache logic, queue utilities, globe geometry, and the contribution-form builder. No browser or network required.

### End-to-end tests (Playwright)

Install a browser once:

```bash
npx playwright install chromium
```

Build the site and start the preview server, then run:

```bash
npm run test:e2e
```

Or let Playwright start the preview server automatically (it will run `npm run preview`):

```bash
npm run test:e2e
```

**Important notes:**

- The **contribute spec** (`tests/e2e/contribute.spec.ts`) inserts a real `pending` row into whichever Supabase project your `.env` points at. Use a disposable/test project, or delete the test row from the `messages` table in the Supabase dashboard afterward.
- The **moderation spec** (`tests/e2e/moderate.spec.ts`) is skipped automatically unless two environment variables are set:

  ```bash
  MOD_EMAIL=admin@example.com MOD_PASSWORD=yourpassword npm run test:e2e
  ```

---

## Architecture

```
src/
  pages/
    index.astro          # home page — renders Hero
    moderate.astro       # admin moderation page (auth-gated)
  components/
    Hero.astro           # static shell: CTA button, globe mount point, voice count
    hero/
      island.ts          # client-side entry: mounts globe, wires form + realtime
      globe.ts           # three-globe setup and dot rendering
      globe-style.ts     # style helpers for the globe canvas
      contribution-form.ts # pure form-builder logic (validation, submit)
    moderate/
      queue.ts           # admin login + pending-row approval/rejection
  lib/
    supabase.ts          # typed Supabase client (reads PUBLIC_* env vars)
    voices.ts            # Dot type, row→dot mapping, localStorage cache helpers
    validation.ts        # message/country input validation rules
    countries.ts         # isValidCountryCode helper
    countries-data.ts    # ISO code → centroid lat/lng lookup table
    profanity.ts         # client-side profanity filter
  content/
    hero/main.json       # CMS-style copy (headline, subhead, CTA label, pending msg)
  styles/
    global.css

supabase/
  migrations/
    20260529000000_init_messages.sql   # table, RLS policies, realtime publication

tests/
  unit/                  # Vitest unit tests (no browser)
  e2e/                   # Playwright E2E specs (require browser + live Supabase)
```

### Data flow

1. On load, the hero reads approved dots from `localStorage` (cache) and optimistic dots (pending local submissions), renders immediately, then fetches the live approved list from Supabase and reconciles.
2. A Supabase Realtime channel pushes newly approved rows so dots appear without a page reload.
3. When a visitor submits the form, the message is inserted directly into `messages` with `status = 'pending'`. An optimistic dot is added to `localStorage` (`ik101.voices.optimistic.v1`) and shown on the globe immediately.
4. An admin logs in at `/moderate`, sees pending rows, and approves or rejects each one. Approval triggers the realtime channel for all connected clients.

### Pre-launch TODO

A Supabase Edge Function (`submit-message`) is planned as a server-side spam throttle (rate-limit by IP before the row reaches the table). The current implementation inserts directly from the client using the anon key, which is protected by RLS but has no per-IP rate limiting.
