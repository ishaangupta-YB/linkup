# LinkUp

A link-in-bio platform. A creator signs up, claims `linkup.to/<handle>`, builds a page (photo, name, tagline, bio, location, links, social icons, look), publishes it, and sees what visitors tap.

The design system is the [Hallmark](https://github.com/Nutlope/hallmark) **Dose** theme: warm grained paper, tinted plastic, green-black ink, Schibsted Grotesk over Instrument Sans with DM Mono for addresses and times, and one pharmacy green for every signal.

**Demo stage.** There is no server yet. Accounts, pages and analytics events are stored in the browser's `localStorage` through an async demo API (`src/lib/api.ts`) that keeps the contract a real backend will keep. AWS comes later; see [docs/analytics.md](docs/analytics.md).

## Deploy

Vercel builds it as a Vite app (`vercel.json`): `npm run build` into `dist`, with every path rewritten to `index.html` so routes such as `/thedesignsquare` and `/app/editor` load on a fresh visit. Import the GitHub repo in Vercel, keep the defaults, and set the optional `VITE_ANALYTICS_*` variables from docs/analytics.md.

## Run

```sh
npm install
npm run dev          # http://localhost:5173
npm run build
npm test             # unit tests (vitest)
npm run test:e2e     # Chromium end-to-end tests, desktop and Pixel 7 (Playwright)
npm run lint
```

Demo account: `demo@linkup.to` / `linkup-demo` (or "Use the demo account" on the sign-in screen). Its page is live at `/thedesignsquare`.

## Routes

| Path | Screen |
| --- | --- |
| `/` | Landing page |
| `/signup`, `/signin` | Account screens |
| `/onboarding` | Claim your page address |
| `/app/editor` | Edit the page beside a live phone preview |
| `/app/analytics` | Analytics for your page |
| `/app/settings` | Account, password, address, publishing, analytics privacy, delete account |
| `/:handle` | A published public page |

## What works

- **Accounts:** sign up, sign in, sign out, change name, email and password, delete the account (which frees the address). Passwords are hashed with PBKDF2 in the browser; this is a demo, not real security.
- **Demo backend rules:** every save is validated and normalised the way a server would (length limits, only web, mail and phone links, photos up to 400 KB). The stored data has a schema version with migrations; data it cannot read is copied to `linkup:db:backup` before starting fresh. An edit made in another tab is never silently overwritten: the editor shows "Edited in another tab" with a Reload action. Signing in or out in one tab is followed by the others, and unsaved edits in a tab survive an ended session when the same account signs back in there.
- **Phones:** built for one hand at 360 px and up: Publish in the bottom tab bar, a section strip and Preview dock in the editor, touch reading on charts, 44 px targets, safe areas.
- **Address:** 3 to 30 characters (lowercase letters, numbers, dots, underscores), checked live; app paths such as `app` or `settings` are reserved.
- **Editor:** photo upload (cropped and resized to 512 px), name, tagline, bio and location with counters; up to 8 links with drag or keyboard reorder, hide without deleting, duplicate, delete with undo, and URL checks with a one-tap `https://` fix; six social icons; three grounds, seven plastic tints, three button styles and three shapes. Edits autosave to a draft; **Publish** makes them live.
- **Public page:** only published content is served. Links open in a new tab and only `http(s)`, `mailto` and `tel` links are rendered as links.
- **Analytics:** page views, unique visitors, link clicks, click rate, sources (UTM tag or referrer), devices, browsers, countries (from the time zone), hours of day and social clicks, over today, 7, 30 or 90 days with the change against the previous period. Every chart has a table view. Export to CSV or JSON. Real events are recorded; "Include sample data" mixes in generated events (always labelled) so a new page is not empty. The owner's own visits are not counted unless they turn that on, and Do Not Track and Global Privacy Control are respected.

## Structure

```
src/
  lib/          types, demo API, auth and page providers, URL and handle rules
  analytics/    event schema, tracker, transports (local, HTTP), aggregate, sample data, export
  ui/           controls (Button, TextField, Toggle, Segmented, ...), Icon, Toast
  styles/       Hallmark Dose tokens, base and shared control styles
  shell/        the /app top bar and mobile tab bar
  profile/      ProfileView, the public page renderer (also used in previews)
  routes/       landing, auth, editor, analytics, settings, public
e2e/            Playwright tests
docs/           analytics.md
.hallmark/      Hallmark build log
```
