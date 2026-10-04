# SavePay Tracker

A free, installable budgeting app for phones. Set a monthly max for each spending category, scan receipts, track what you earn and spend, and save toward goals between biweekly paychecks.

**Open the app:** https://chaitalipatil2002.github.io/SavePayTracker/

## Features

- **First-time setup**: pick categories (rent, groceries, subscriptions, PG&E…), set a monthly max for each, enter your paycheck and goals.
- **Category meters**: green under 50% of the limit, orange from 50%, red from 85%. Each state also has an icon and a label, so it never relies on color alone.
- **Receipt scanning**: reads the total, store and date from a photo right on the phone (Tesseract.js), then guesses the category from the store name. Free, and works offline after the first scan.
- **Payday check-in**: days until your next paycheck and how much you can spend in each category until then.
- **Reminders every 5 days**: phone notifications (best on Android), plus a repeating calendar event for any phone.
- **Savings goals**: how much to save per month and per paycheck to hit each deadline.
- **Private by design**: all data stays on the device. Use *Settings → Save backup* to keep a copy.

## Install on a phone

- **Android (Chrome):** open the link, tap **Install** (or menu ⋮ → *Install app*).
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**. Notifications work only from the home-screen app (iOS 16.4+).

## How it's built

Plain HTML, CSS and JavaScript, with no build step and no server.

| File | What it does |
| --- | --- |
| `index.html` | App shell |
| `styles.css` | Design tokens (light and dark), layout and components |
| `app.js` | Screens, setup steps, receipt scanning, backups |
| `budget.js` | Money math and on-device storage (shared with the service worker) |
| `sw.js` | Offline support and background check-in notifications |
| `manifest.webmanifest` | Makes it installable |

Every push to `main` publishes to GitHub Pages through `.github/workflows/pages.yml`.

### Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Publishing to the Play Store later

When you're ready to pay Google's one-time $25 developer fee, this app can be wrapped as an Android app with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) or [PWABuilder](https://www.pwabuilder.com/) without rewriting it.
