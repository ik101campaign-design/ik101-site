# IK101 Interactive Globe Hero — Design Spec

**Date:** 2026-05-29
**Status:** Draft for review
**Scope:** The landing-page hero for the rebuilt ik101.org — a split layout with an interactive 3D globe on which every visitor can leave a short message that appears as a glowing point at their country.

---

## 1. Goal

Replace the current ik101.org hero with a "living map of the movement": a real, rotatable 3D globe where each dot is one supporter's message. Submitting a message lights up a new point. This makes the site's thesis — *"101 Sparks for a Progressive Pakistan," "From his legacy to your action"* — literal: a dark/quiet world that fills with light as people join.

Reference for the interaction model: citizenofnutopia.com (wireframe Earth, dots = people, live population counter).

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Framework | Astro (static / SSG) |
| Project location | `/Users/hamzazuberi/Downloads/ik101/site/` |
| Hero layout | Split: copy left, globe right (desktop). Stacked on mobile (see §10) |
| Globe library | `three-globe` (three.js) — needed for per-dot click/data |
| Globe style | Light / Nutopia-faithful: white background, faint gray coastline wireframe, muted gray dots, green (`#00BF63`) accent + newest dots |
| Contribution | ≤150-char message + optional display name (anonymous default) + country |
| Dot location | Country-level only (privacy); client resolves country → centroid + jitter |
| Moderation | Submitter sees own dot instantly (optimistic); public sees it only after admin approval |
| Backend | Supabase (Postgres + auto API + realtime + RLS) |
| Admin login | Supabase Auth, magic link **and** password; only client's email provisioned |
| Privacy | No IP addresses stored (deliberate, for an at-risk audience) |
| Hero copy | Sourced from an editable content file (Decap-ready) |

## 3. Architecture

```
Browser (Astro static HTML, CDN-cached)
  ├── Hero.astro ............ static; renders copy from content file; reserves globe space
  ├── GlobeIsland (vanilla TS) lazy-loaded island; three-globe canvas
  │     ├── reads cached dots from localStorage (instant), then
  │     ├── fetches approved dots from Supabase, then
  │     └── subscribes to Supabase realtime for live updates
  └── ContributionForm ...... validates, inserts (status=pending), optimistic local dot

Supabase
  ├── messages table (Postgres)
  ├── RLS policies (read approved-only; insert forced pending; admin-only status change)
  ├── Realtime (broadcasts approved inserts/updates)
  └── Auth (admin: magic link + password)

/moderate (Astro page + guarded island)
  └── lists pending → Approve/Reject (admin only)
```

Design principle: the **only** JavaScript on the landing page is the globe island. Everything else is static HTML/CSS. The island is code-split and lazy-loaded so it never blocks first paint.

## 4. Data Model

Table `messages`:

| column | type | constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `message` | text | not null, `char_length(message) <= 150` |
| `display_name` | text | nullable (null = Anonymous) |
| `country_code` | text | not null, ISO-3166 alpha-2, validated against allowed set |
| `status` | text | not null, default `'pending'`, in (`pending`,`approved`,`rejected`) |
| `created_at` | timestamptz | not null, default `now()` |

- **No** latitude/longitude column and **no** IP column. The browser maps `country_code` → centroid via a bundled JSON (`src/lib/countries.ts`) and adds small random jitter so many dots in one country fan into a cluster.
- `rejected` rows are retained (hidden), not hard-deleted — audit trail, no accidental loss.

## 5. Security (Row-Level Security)

- **SELECT (anon):** only rows where `status = 'approved'`.
- **INSERT (anon):** allowed, but a trigger/check forces `status = 'pending'` regardless of payload — a planted/abusive message is never publicly visible on insert.
- **UPDATE / DELETE:** denied to anon. Only the authenticated admin (single provisioned account) may change `status`.
- Supabase anon key is public (safe by design); all authority is enforced by RLS, not the client.

## 6. Privacy

- No IP stored, even hashed — for an audience that includes people under surveillance, an IP log is a liability not worth its anti-spam value.
- Anonymity is the default (name optional).
- Country is the finest location granularity that exists anywhere in the system.
- Anti-spam without IPs: a localStorage submission cooldown + a lightweight server-side throttle (e.g., a short-window limit in an edge function) that persists nothing identifying.

## 7. Hero & Globe Component

**Layout (desktop):** left column = eyebrow → H1 → subhead → primary CTA "Add your voice" → live `VOICES: N` counter. Right column = three-globe canvas. All copy read from `src/content/hero.*` (editable file, Decap-ready) — no hardcoded strings.

**Globe behavior:**
- White background; faint gray coastline wireframe; dots at country-centroid + jitter.
- Default dots muted gray; green (`#00BF63`) accent; newest dots pulse green.
- Auto-rotates slowly; drag to spin; rotation pauses during interaction.
- Click/tap a dot → popover (message · name or "Anonymous" · country).
- `prefers-reduced-motion` → no auto-rotation; static globe.
- Counter = count of `approved` rows; ticks up on realtime events.

## 8. Contribution Flow

1. Click "Add your voice" → form: message (textarea w/ live `0/150` counter), optional name ("leave blank to stay anonymous"), country (searchable select).
2. Submit → insert to Supabase with `status = 'pending'`.
3. **Optimistic display:** the submitter's dot appears immediately on *their* globe in a "pending" state, saved to localStorage so it survives reload, with copy like *"Your spark is live for you. It'll light up for everyone once approved."*
4. **Other visitors** see it only after approval; via realtime it then animates onto their globes live.
5. Validation: required message + country; ≤150 chars; profanity filter (client + server); anti-spam cooldown — no IP stored.

## 9. Moderation Admin (`/moderate`)

- Supabase Auth with **magic link + password**; only the client's email provisioned (no public signup).
- Review queue: pending messages as cards (text · name/Anonymous · country + flag · time) with green **Approve** / red **Reject**.
- Approve → `status = approved` → dot animates live onto every globe via realtime. Reject → `status = rejected` (hidden, retained).
- "N awaiting review" indicator; optional daily email digest (Supabase scheduled function). Fully phone-friendly.
- All writes gated by RLS to the admin account.

## 10. Performance (priority requirement)

Target: impeccable speed. Core Web Vitals gates — **LCP < 1.5s, INP < 200ms, CLS < 0.1**, low TBT (verified via Lighthouse/PSI).

- **Static-first:** Astro SSG; pre-rendered, CDN-cacheable HTML; zero JS except the globe island.
- **LCP = hero text/CTA** (static HTML/CSS) — never gated by the globe. Self-host a subsetted display font, preload it, `font-display: swap` (or a system stack).
- **Globe JS is the heaviest dependency** (three.js ≈150KB gz + three-globe). Mitigations:
  - Dynamic `import()` on `client:idle` (desktop) / `client:visible` (mobile) — off the critical path, never blocks LCP/TBT.
  - Reserve the globe container via CSS `aspect-ratio` → **CLS = 0**.
  - Cap `devicePixelRatio` (e.g. `min(2, dpr)`).
  - Pause `requestAnimationFrame` when the globe is off-screen (IntersectionObserver) or the tab is hidden (`visibilitychange`).
  - If approved messages exceed ~5–10k, aggregate per country (dot size ∝ count) instead of one dot per row.
- **Data:** preconnect to Supabase; first globe paint uses localStorage-cached dots instantly, then refreshes; realtime for updates.
- **Assets:** brotli/gzip, immutable hashed caching, responsive AVIF/WebP for any imagery.
- **Documented fallback:** if measured CWV suffer from three.js weight, fall back to `cobe` (~5KB) + an invisible hit-test overlay for per-dot clicks.

## 11. Responsive / Mobile (priority requirement)

Side-by-side does not work on narrow screens. Below ~768px:
- **Stack vertically.** Order: eyebrow → H1 → subhead → CTA → counter (this block is the LCP, above the fold), **then** the globe full-width below it.
- Globe loads `client:visible` (only when scrolled to) — correct layout *and* a performance win.
- Globe full-width, height capped (reserved space → no CLS); touch drag to rotate; tap a dot → popover as a bottom sheet.
- CTA may be sticky on mobile for easy reach.
- **To confirm in review:** exact mobile globe size and whether the globe stays below the fold (recommended) vs. a compact teaser above the fold.

## 12. Error Handling

- Submit fails (offline) → queued in localStorage, auto-retried on reconnect; optimistic dot shows a "saving…" state.
- Globe data fails to load → globe still renders from last-cached dots with a quiet "couldn't refresh" notice.
- Realtime drops → auto-reconnect, then re-fetch to catch missed dots.
- Rate-limit hit → friendly "you just added a spark — give it a moment."
- Form validation errors → inline messages.

## 13. Testing

- **Unit:** country-code → centroid + jitter; message validation (length, required); profanity filter; status transitions.
- **Security (RLS):** anon reads only `approved`; anon insert forced to `pending`; anon cannot approve/delete; admin can.
- **Integration:** submit → pending (invisible to others) → approve → appears; reject → never appears.
- **Component:** globe renders with mock dots; popover on click; reduced-motion disables autorotate.
- **E2E:** full contribution flow incl. own-dot persistence on reload; admin login (both methods) + approve.
- **Accessibility:** labeled form, keyboard nav, modal focus trap, green-on-white contrast.
- **Performance:** Lighthouse/PSI run as a CI gate against the §10 targets.

## 14. Out of Scope (separate specs)

- **Decap CMS / site-wide content management** — its own spec, immediately after this one. (This spec only ensures hero copy lives in an editable content file.)
- **Rebuilding the other 57 pages** of ik101.org — separate work.
- **The broader visual design system** beyond the hero.

## 15. Resolved Decisions

1. **Mobile globe** — stack vertically; globe full-width **below the fold**, lazy-loaded on scroll (§11).
2. **Island implementation** — **vanilla TS** (minimal JS footprint; no framework runtime).
3. **Daily digest email** — **deferred** past v1; the in-page "N awaiting review" badge covers launch.
4. **Profanity filtering & spam throttle** — handled by a **Supabase edge function** on insert: the client calls the edge function (rather than inserting via PostgREST directly), which applies the profanity filter and the IP-less rate limit in one server-side place, then inserts with `status = 'pending'`. This refines §8 step 2 and the anti-spam note in §6.
