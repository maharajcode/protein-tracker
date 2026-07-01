# 🥤 Protein.Log — Protein Drink Tracker

A dark, supplement-label-themed Progressive Web App for building a daily protein habit. Log a drink in one tap, watch a streak grow, unlock badges, and see a full year of consistency in a heatmap — all offline-capable, installable, and available in 8 languages.

> **Design note:** this is a full visual redesign of an earlier "glass card" build of the same tracker. The interaction logic and feature set are unchanged; the look is new — see [Design rationale](#design-rationale) below.

---

## ✨ Features

| Feature | Detail |
|---|---|
| **One-tap logging** | Big primary action toggles today's drink on/off, with confetti + a toast on success |
| **App-day reset at 2 AM** | Logging at 1 AM still counts for "yesterday" so night-owls aren't penalized |
| **Streaks & milestones** | Consecutive-day streak counter with 7 / 14 / 30 / 100-day badge tiers |
| **Weekly ring** | SVG progress ring showing days hit out of the last 7 |
| **Achievements** | 5 unlockable badges (First Sip → Centurion) |
| **Monthly stats** | Collapsible bar showing % of the current month completed |
| **365-day heatmap** | GitHub-style contribution grid, auto-scrolled to today |
| **Full history ledger** | Sortable table of every logged day, with time-of-day |
| **Export** | Download history as CSV or a themed PDF (jsPDF) |
| **i18n** | English, French, Dutch, Arabic, Turkish, Spanish, Swedish, Russian |
| **Offline / installable** | Service worker caches the app shell; add-to-home-screen via manifest |
| **Reminders** | Opt-in daily browser notification via the service worker |
| **Protein food reference** | Second page with a Chart.js bar chart of natural protein sources, filterable by diet type |
| **Light/dark themes** | Persisted, respects `prefers-color-scheme` on first visit |

---

## 🗂️ Project structure

```
protein-tracker/
├── index.html          # Main tracker page (markup only — logic lives in app.js)
├── protein-food.html    # Protein food reference chart
├── app.js               # All application logic (state, streaks, UI, export)
├── styles.css            # Design system (CSS custom properties + components)
├── translations.js       # i18n dictionary, 8 languages
├── sw.js                 # Service worker (offline cache + reminders)
├── manifest.json          # PWA manifest
├── icons/
│   └── icon.svg           # App icon (scoop/shaker mark)
├── package.json
├── package-lock.json
└── README.md
```

No build step, no framework, no dependencies beyond two CDN scripts (`jsPDF` for export, `Chart.js` for the food page). Open `index.html` and it runs.

---

## 🎨 Design rationale

**Concept:** *a supplement tub label, brought to life.* Protein powder packaging already has a strong, recognizable visual language — bold neon-on-black branding for the tub itself, and a dense, functional "Nutrition Facts" panel on the back. This design borrows both:

- **Palette** — near-black charcoal (`#12130B`) canister background, a neon lime accent (`#C6FF3D`) lifted straight off a supplement tub, and a warm rust (`#FF7A3D`) for secondary accents/PDF export. A cream "label paper" tone (`#EFEADA`) is reserved for one surface only — see below.
- **Signature element** — the right-hand dashboard is styled as a **Serving Facts panel**: cream paper, a thick black rule under the title, thin rules separating sections, and condensed mono numerals — a direct nod to the nutrition label on the back of a real protein tub. This is the one place the design "takes a risk," and everything else stays quiet so it reads as intentional rather than decorative.
- **Type** — `Archivo Black` for display/headings (the same energy as tub branding), `Work Sans` for body copy, and `IBM Plex Mono` for anything numeric or data-like (clock, streak count, ring counter, table figures) — echoing the tabular type of a real nutrition label.
- **Hero graphic** — the original build used bitmap illustrations (`drank.png` / `not-drank.png`). This version replaces them with inline SVG (a shaker bottle that visibly fills when you log a drink) so the graphic is theme-aware (recolors with light/dark mode), scales crisply at any size, and ships with zero image weight.
- **Functional continuity** — every element ID app.js depends on was kept identical, so the redesign is a pure presentation-layer change with no risk to the underlying state logic.

---

## 🚀 Run locally

No build tools required.

```bash
# from the project folder
npx serve .
# or simply open index.html directly in a browser
```

Service workers require a proper origin (not `file://`) to register, so for full offline/PWA testing use `npx serve .`, `python3 -m http.server`, or similar.

---

## 📤 Push this to GitHub

```bash
cd protein-tracker

# 1. Initialize git (skip if already a repo)
git init
git branch -M main

# 2. Stage and commit
git add .
git commit -m "Redesign: supplement-label theme for Protein.Log"

# 3. Create the remote repo (via GitHub CLI) — or create it manually on github.com first
gh repo create protein-drink-tracker --public --source=. --remote=origin

# 4. Push
git push -u origin main
```

If you already have a remote:

```bash
git remote add origin https://github.com/<your-username>/protein-drink-tracker.git
git add .
git commit -m "Redesign: supplement-label theme for Protein.Log"
git push -u origin main
```

**Suggested `.gitignore`** is already included (`node_modules/`, OS/editor cruft). Since this project has no real npm dependencies, `package-lock.json` is safe to commit as-is.

### GitHub Pages (optional, for a live demo link)

Settings → Pages → Deploy from branch → `main` / root. The app will be live at `https://<username>.github.io/protein-drink-tracker/` within a minute or two — handy to link from a resume or interview follow-up.

---

## 🎤 Interview prep — how to talk about this project

**30-second summary:**
"It's a vanilla-JS Progressive Web App that tracks a daily habit — drinking a protein shake. No framework, no build step: just HTML/CSS/JS plus a service worker for offline support. The interesting parts are the date-boundary logic for a habit tracker, and a from-scratch canvas confetti/particle system."

**Be ready to walk through, in order of likely depth:**

1. **"App day" boundary (`RESET_HOUR = 2`)**
   Why: habit trackers that reset at midnight punish people who go to bed late. `getDateKey()` subtracts a day from the calendar date whenever `now.getHours() < 2`, so 1 AM still belongs to "yesterday." This single function is the seam every other date calculation (`getStreak`, `getWeeklyCount`, heatmap, monthly stats) reads through — good example of a small utility that many features quietly depend on, and a good "what would you refactor" answer: it's a **module-level constant closed over by every date function**, which is fine at this size but would become a shared "clock service" if the app grew.

2. **Streak calculation**
   `getStreak()` walks backward day-by-day from today through a `Set` built from history, stopping at the first gap. O(n) in streak length, not total history size — worth mentioning if asked about complexity.

3. **State shape & persistence**
   Single `localStorage` key holding `{ dateKey, drank, drinkTimestamps, history }`. `history` is capped at `HISTORY_MAX_DAYS` (365) on every write so storage can't grow unbounded. Self-healing: `getHistory()` reconciles `history` against the `drank` flag for today in case they ever drift (e.g. a bug elsewhere flips one but not the other).

4. **i18n approach**
   A flat dictionary keyed by language code, `{name}`-style placeholder interpolation (`monthlyStatsCompleted`) rather than a library — appropriate given the app's size, but you should be able to name what you'd reach for at scale (ICU MessageFormat / `Intl.PluralRules` for pluralization, a proper i18n framework once placeholder logic gets more complex than string `.replace()`).

5. **Offline strategy**
   Network-first with cache fallback (`fetch(...).catch(() => caches.match(...))`) rather than cache-first — trades a little offline speed for always showing fresh content when online, which is the right call for infrequently-changing app-shell files. Cache versioning via `CACHE_NAME` string bump + purge-old-caches-on-activate is the standard SW upgrade pattern; be ready to explain why `skipWaiting()`/`clients.claim()` are needed to avoid a stuck "two-tab" state during updates.

6. **The redesign itself**
   Good story for a "tell me about a design decision" question: the brief was to reskin an existing working app without touching logic. The approach was to treat every DOM `id` as a stable contract with `app.js`, then redesign purely at the HTML/CSS layer — a clean example of separating presentation from behavior, and of shipping a UI change with confidence because the thing that could break (state logic) was never touched.

7. **What's not production-ready (be upfront if asked)**
   - No automated tests — logic like `getStreak`/`getDateKey` is pure and easy to unit test but currently isn't.
   - `localStorage` only — no backend, so habit data doesn't sync across devices.
   - Notification reminder logic polls every 60s in the service worker rather than using the Notification Triggers API (limited browser support was the tradeoff).
   - PDF export duplicates date-formatting logic already in `app.js` — a real refactor target.

**Good clarifying question to ask an interviewer back:** "Do you want me to talk about this as a solo hobby project or walk through it like a PR I'm asking someone to review?" — shows you can adapt depth to audience.

---

## 🖼️ Visual identity at a glance

- **Ink** `#12130B` — canister background
- **Lime** `#C6FF3D` — primary accent, streak fill, active states
- **Rust** `#FF7A3D` — secondary accent, PDF export accent
- **Paper** `#EFEADA` — the one cream surface, reserved for the Serving Facts panel
- **Display type** — Archivo Black · **Body** — Work Sans · **Data/mono** — IBM Plex Mono

---

## License

MIT — do whatever you'd like with it.
