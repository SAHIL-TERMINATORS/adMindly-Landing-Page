# Admindly

Marketing site **and** interactive product demo for **Admindly** — an agentic
copilot suite for marketers, brands and influencers (creative feedback,
performance monitoring, competitor intelligence, behind one login).

Plain HTML + one CSS file + one JS file. No build step, no dependencies.
Deploys as-is to GitHub Pages from the repo root.

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
| `chat.html` | Creative Copilot | Split thread + canvas; composer replies, before/after, revert, apply-edit |
| `library.html` | Creative Library | Filter by type / "edited by Copilot", grid ↔ list, version history |
| `monitoring.html` | Monitoring Dashboard | 30 / 60 / 90-day switch redraws the KPI strip and trend chart; connected / not-connected |
| `competitors.html` | Competitor & Market Analysis | Click a leaderboard row to load that competitor's breakdown; "Trending now" |
| `calendar.html` | Content Calendar | Month ↔ list view, month navigation with empty states |
| `notifications.html` | Notifications Center | Category filter, "mark all read" clears unread + nav badges |

The four working modules share a persistent left nav + top bar, injected by
`assets/app.js`. All app interactions are scripted prototype behaviour — no
backend, dummy auth, sample data throughout.

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
- Fonts: Sora + IBM Plex Sans + IBM Plex Mono (Google Fonts)
- `favicon.svg`

> Earlier revisions linked `assets/styles.css` / `assets/app.js` while the
> files sat in the repo root, so every page loaded unstyled. The files now
> live in `assets/` to match.

## Run

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Not final

Placeholder copy and sample data throughout — pricing, metrics, competitor
numbers and testimonials are illustrative. Out of scope: a full in-app
photo/video editor (edit-and-regenerate through chat is the differentiator).
