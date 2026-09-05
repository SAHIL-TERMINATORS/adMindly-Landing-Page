# Admindly — Prototype (black & blue theme)

Static, multi-page prototype for the **Admindly** agentic copilot suite for marketers, brands and influencers, built from `Admindly_Prototype_Brief.pdf` (v1).

Each screen from the brief is its own page. The four working modules share a persistent left nav (injected by `assets/app.js`).

## Pages

| File | Screen | Notes |
|---|---|---|
| `index.html` | Flow map / overview | Entry point — links to every screen |
| `auth.html` | 01 · Authentication | Login/signup toggle, SSO placeholders, field-error + submitting states |
| `onboarding.html` | 02 · Onboarding | Role + category, then OAuth account connection |
| `home.html` | 03 · Home / app shell | Navigation hub, connection status, quick links |
| `chat.html` | 04 · Creative Copilot | **Core.** Split-pane thread + canvas; states: empty, suggestion given, edit applied (before/after), reverted, generating |
| `library.html` | 05 · Creative Library | Grid of originals + AI-edited versions, version history |
| `monitoring.html` | 06 · Monitoring Dashboard | 30/60/90 switcher, KPI strip, trend chart, per-creative table, AI explainer note; connected + not-connected |
| `competitors.html` | 07 · Competitor & Market Analysis | Category selector, leaderboard, competitor detail, "Trending now", bridge to Copilot |
| `calendar.html` | 08 · Content Calendar | Month grid, schedule approved creatives (stub) |
| `notifications.html` | 09 · Notifications Center | Underperformance / competitor / trend alerts, approvals stub |

## Stack

Plain HTML + one CSS file + one JS file. No build step, no dependencies.
Fonts: Sora + IBM Plex Sans + IBM Plex Mono (Google Fonts).

- `assets/styles.css` — single committed dark theme (`--bg` near-black, `--blue #2F6BFF` accent)
- `assets/app.js` — injects the sidebar + topbar into pages with `data-page`, plus small prototype toggles

## Run

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Deploys as-is to GitHub Pages (root).

## Not final

Placeholder copy and sample data throughout. Theme colours are a stand-in for the
supplied black & blue template — swap the tokens at the top of `assets/styles.css`.
Out of scope for the prototype: a full in-app photo/video editor.
