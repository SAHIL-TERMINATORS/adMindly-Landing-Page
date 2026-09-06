# Admindly

Marketing site **and** interactive product demo for **Admindly** — an agentic
copilot suite for marketers, brands and influencers (creative feedback,
performance monitoring, competitor intelligence, behind one login).

Plain static HTML/CSS/JS for the site, plus one small serverless function that
proxies the **Creative Copilot** chat to the Gemini API (key stays server-side).
No build step. The static site deploys as-is to GitHub Pages; the live Copilot
needs the proxy deployed too (see **Live Copilot** below) and degrades to
scripted replies without it.

## Two parts

| | Entry | What it is |
|---|---|---|
| **Marketing site** | `index.html` | Full landing page — hero, feature sections, how-it-works, testimonials, pricing, FAQ, footer. |
| **Interactive demo** | `prototype.html` | Flow map / hub linking all nine app screens. |

### App screens (the demo)

| File | Screen | Now does |
|---|---|---|
| `auth.html` | Authentication | Login / signup toggle, SSO placeholders, field-error state |
| `onboarding.html` | Onboarding | Role + category, then OAuth account connection |
| `home.html` | Home / app shell | Navigation hub, connection status, quick links |
| `chat.html` | Creative Copilot | Split thread + canvas; **live Gemini** replies + generated suggestions (scripted fallback); **Creative Library panel** to switch the creative in focus; per-creative **Preview / Edit / Apply** (+ Revert); accepts `?creative=<id>` and `?brief=<text>` |
| `library.html` | Creative Library | Filter by type / "edited by Copilot", grid ↔ list, version history; "Open in Copilot" deep-links `chat.html?creative=<id>` |
| `monitoring.html` | Monitoring Dashboard | OAuth-per-platform connect cards; 30 / 60 / 90-day switch redraws the KPI strip + trend chart; **AI-generated** "why the change" note |
| `competitors.html` | Competitor & Market Analysis | Click a leaderboard row → that competitor's breakdown; "Trending now"; "Apply this trend" bridges to `chat.html?brief=…` |
| `calendar.html` | Content Calendar | Month ↔ list view, month navigation with empty states |
| `notifications.html` | Notifications Center | Category filter, "mark all read" clears unread + nav badges |

The four working modules share a persistent left nav + top bar, injected by
`assets/app.js`. Auth is dummy and the data is sample data throughout. Every
interaction is scripted **except** the Creative Copilot chat and the AI
explainer notes on Monitoring / Home, which call Gemini when the proxy is
configured (and fall back to scripted text when it isn't).

### Module map

```
 Influencer / PM / co-founder
        │
   Auth (SSO)  →  Roles & Category  →  Dashboard shell
                                            │
        ┌───────────────────────────────────┼───────────────────────────────┐
        ▼                                   ▼                               ▼
  Chat module                       Monitoring module               Competitors module
  ───────────                       ─────────────────               ──────────────────
  Chat interface (Gemini)           OAuth cards per platform         Leaderboard
   ├─ Creative Library panel         ├─ Charts (engagement/time)     Trending
   └─ per-creative actions:          ├─ Per-creative KPI table       Competitor analysis
      Preview · Edit · Apply         └─ AI-generated notes            │
                                                                     └─ "Apply this trend"
                                                                        → chat.html?brief=…
```

`competitors → chat` (`?brief=`) and `library → chat` (`?creative=`) are the
cross-module links that close the loop back to the creative.

## Theme — light + dark

Dark is the signature look. Light is a full, first-class alternate.

- **No stored choice** → follows the OS (`prefers-color-scheme`).
- **Header / corner toggle** overrides it and is remembered (`localStorage`
  key `admindly-theme`).
- A tiny inline `<head>` script applies the saved theme before first paint,
  so there's no flash.

All colours are painted through CSS custom properties in `assets/styles.css`:
the light palette is defined on `:root`; the dark palette overrides it under
`@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`. To
retheme, change the token values — not the component rules.

## Stack

- `assets/styles.css` — the whole design system, both themes
- `assets/app.js` — sidebar/topbar injection, theme toggle, mobile nav drawer,
  shared tab/segment/chip behaviour
- `assets/copilot.js` — Creative Copilot chat client + Gemini calls + fallback
- `assets/monitor.js` — Monitoring: Instagram connect + real / sample metrics
- `api/chat.js` — Gemini proxy (Vercel serverless function)
- `api/_ig.js` + `api/auth/instagram/*` + `api/instagram/insights.js` — Instagram OAuth + data
- `worker/` — the chat proxy as a Cloudflare Worker (`worker.js`, `wrangler.toml`)
- `.env.example` — every env var the backends read
- Fonts: Sora + IBM Plex Sans + IBM Plex Mono (Google Fonts)
- `favicon.svg`

> Earlier revisions linked `assets/styles.css` / `assets/app.js` while the
> files sat in the repo root, so every page loaded unstyled. The files now
> live in `assets/` to match.

## Live Copilot (Gemini)

`chat.html` talks to **Gemini** through a small server-side proxy so the API key
never reaches the browser. The other screens stay scripted; `monitoring.html`
and `home.html` also ask the proxy to write their "Why the change" note.

**If no proxy is reachable, the chat falls back to scripted replies** and shows a
`○ demo mode` badge — so the site still works on plain GitHub Pages.

### Contract

```
POST <api-base>/api/chat
{ "task": "copilot" | "insight",
  "history": [{ "role": "user"|"model", "text": "..." }],
  "context": { ... } }
→ { "reply": "...", "suggestions": [{ "kind","title","detail" }], "model": "..." }
```

`<api-base>` comes from `<meta name="admindly:api-base" content="">` in each page
(empty = same origin).

### Deploy the proxy — pick one

**Vercel** (hosts the static site + the function together):

```bash
npm i -g vercel
vercel                       # link the project
vercel env add GEMINI_API_KEY   # paste your key (aistudio.google.com/apikey)
vercel --prod
```

`api/chat.js` is picked up automatically as `/api/chat`. Leave the `api-base`
meta empty.

**Cloudflare Workers** (static site stays on GitHub Pages):

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```

Then set every page's meta to the Worker URL:
`<meta name="admindly:api-base" content="https://admindly-proxy.<you>.workers.dev">`

(Cloudflare covers only the chat. Instagram Monitoring below needs the Vercel
functions or an equivalent Node backend.)

For real traffic, add rate-limiting at the proxy (Vercel/Cloudflare both have
KV / edge options) — a public endpoint with your key is otherwise open to abuse.

## Live Monitoring (Instagram)

The Monitoring dashboard shows **sample data** until an Instagram account is
connected. "Connect Instagram" runs a real OAuth flow (Instagram API with
Instagram Login); the token is stored server-side in Upstash Redis and never
reaches the browser. If the backend isn't deployed, Monitoring stays on sample
data with a "sample data" tag.

### Endpoints (Vercel functions)

```
GET  /api/auth/instagram/start      → redirect to Instagram consent
GET  /api/auth/instagram/callback   → code → long-lived token → session cookie
POST /api/auth/instagram/logout     → drop the token
GET  /api/instagram/insights?window=30|60|90
     → { connected, username, reach, engagement_rate, follower_growth,
         top_post, media:[…], chart:[…] }  |  { connected:false }
```

### Meta app setup

1. developers.facebook.com → **Create App** → type **Business**
2. Add product **Instagram** → **API setup with Instagram login**
3. **Business login settings** → add OAuth redirect URI
   `https://<your-domain>/api/auth/instagram/callback` → copy the
   **Instagram app ID** and **app secret**
4. The Instagram account must be **Business/Creator**, and added under
   **App roles → Instagram Tester** until Meta approves the app for public use
   (App Review + business verification).

### Env vars

| var | for | notes |
|---|---|---|
| `GEMINI_API_KEY` | chat | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | chat | default `gemini-3.6-flash` |
| `IG_APP_ID` / `IG_APP_SECRET` | monitoring | Meta app → Instagram → Business login settings |
| `IG_REDIRECT_URI` | monitoring | optional; defaults to `https://<host>/api/auth/instagram/callback` (must match the Meta app) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | monitoring | upstash.com → Redis DB → REST |
| `ALLOWED_ORIGINS` | both | comma-separated allowlist, default `*` |

Everything degrades gracefully: with none of these set, the whole site works as
static with scripted chat and sample metrics.

## Run

```bash
python3 -m http.server 8000        # static only — chat + monitoring run on sample data
# or, with the live backends:
vercel dev                         # reads .env.local (see .env.example)
```

## Not final

Placeholder copy and sample data throughout — pricing, metrics, competitor
numbers and testimonials are illustrative. Out of scope: a full in-app
photo/video editor (edit-and-regenerate through chat is the differentiator).
