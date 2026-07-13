# Rain Surge Dashboard

An enterprise Rain Surge management dashboard for Team Leads across India.
Google Sheets is the **only** database — every action (Rain Surge ON/OFF,
weather refresh, midnight auto-shutdown, CSV export, report emails) reads
from and writes to a single spreadsheet through a Google Apps Script Web
App API. The front-end is plain HTML/CSS/JS + Bootstrap 5 + Chart.js, built
and run from VS Code, and can be hosted anywhere static files can be served.

---

## 1. How it fits together

```
 ┌─────────────────────────┐        HTTPS GET/POST        ┌──────────────────────────┐
 │  Front-end (VS Code /    │ ───────────────────────────▶ │  Apps Script Web App     │
 │  any static host)        │ ◀─────────────────────────── │  (Code.gs router)        │
 │  index.html + *.js/css   │        JSON responses         │                          │
 └─────────────────────────┘                                │  Sheets.gs  — CRUD       │
        ▲  polls every 12s                                  │  Weather.gs — live API   │
        │  (team-wide sync)                                 │  Email.gs   — reports    │
        │                                                    │  Config.gs  — setup      │
        └── every connected dashboard converges within       └────────────┬─────────────┘
            ~10-15s of any change made by any Team Lead                   │
                                                                            ▼
                                                              ┌──────────────────────────┐
                                                              │  Google Sheet (database)  │
                                                              │  Stores | RainSurgeLog |  │
                                                              │  WeatherCache | Config    │
                                                              └──────────────────────────┘
```

- **No local/external database.** Everything lives in four tabs of one
  Google Sheet.
- **Real-time sync** is polling-based (every 12s, inside the 10–15s
  requirement) rather than sockets, because Apps Script Web Apps don't
  support WebSockets — this is the standard, reliable pattern for a
  Sheets-backed multi-user dashboard.
- **Midnight auto-shutdown** runs as a server-side Apps Script time
  trigger, so it fires at 12:30 AM even if nobody has the dashboard open.
- **Weather API key stays server-side only** — the browser never sees it.
  Login is a simple self-declared name/email (see Phase 5) with no key or
  token involved at all.

---

## 2. File map

| File | Purpose |
|---|---|
| `index.html` | Page shell, Bootstrap layout, script includes |
| `style.css` | Dark "storm sky" theme, responsive dashboard styling |
| `config.js` | All tunable constants (URLs, rates, intervals) — edit this first |
| `googleSheets.js` | fetch() wrapper for every Apps Script API action |
| `weather.js` | Formats cached weather, drives the "rain stopped" alert |
| `timer.js` | Per-store countdown / elapsed-time display, auto-off trigger |
| `dashboard.js` | All DOM rendering — cards, dropdowns, filters, search, CSV |
| `charts.js` | Chart.js pie / bar / line setup |
| `email.js` | "Send Report Email" button wiring |
| `app.js` | Simple name/email login, Rain Surge ON/OFF actions, polling loop |
| `appscript/Config.gs` | Sheet/column constants, one-time setup, triggers |
| `appscript/ImportStores.gs` | Normalizes a raw master-store export (blank-filled City, combined Name_Code) into the `Stores` tab |
| `appscript/Sheets.gs` | All Sheets CRUD, state aggregation, CSV build, midnight sweep |
| `appscript/Weather.gs` | Live weather fetch + 5-minute cache refresh |
| `appscript/Email.gs` | Daily report email (HTML body + CSV attachment) |
| `appscript/Code.gs` | doGet/doPost router — the only Apps Script entry point |

---

## 3. Google Sheet setup

1. Create a new Google Sheet — this is your database.
2. From the Sheet: **Extensions → Apps Script**.
3. Delete the default `Code.gs` stub and paste in the six `appscript/*.gs`
   files from this project (create matching file names in the Apps Script
   editor: `Config`, `ImportStores`, `Sheets`, `Weather`, `Email`, `Code`).
4. In the Apps Script editor, select `setupProject` from the function
   dropdown and click **Run**. This creates five tabs:
   - `Stores` — your normalized master store list: **City, StoreName,
     StoreCode, Latitude, Longitude** (must match this column order).
   - `RainSurgeLog` — created empty with the 25 columns from spec section 13.
   - `WeatherCache` — created empty, populated automatically every 2 minutes.
   - `Config` — editable key/value settings (`ClientReportEmails`,
     `CompanyName`, `SenderName`, `SenderTitle`).
   - `Logins` — every dashboard access (Name, Email, Timestamp, UserAgent).
5. Grant the permissions Google asks for (this script sends email and
   fetches external URLs on your behalf).
6. Edit the `Config` tab: set `ClientReportEmails` (a default/fallback
   recipient list) and `SenderName` / `SenderTitle` / `CompanyName` to
   whatever should appear in the "Regards," sign-off of each city's report
   email. **Then see 3c below** to set up recipients per city rather than
   one shared list for everyone.

### 3c. Per-city recipients (each city emails only its own client)

By default, every city's report goes to the same `ClientReportEmails`
list. If Mumbai and NCR have different clients — so a Mumbai rain-surge
session should only email the Mumbai client, and an NCR session should
only email the NCR client — do this **after** Phase 3a (your Stores tab
is loaded):

1. In the Apps Script editor, open `Config.gs`, select `seedCityRecipients`
   in the function dropdown, and **Run**. This reads every distinct city
   from your `Stores` tab and adds one blank row per city to the `Config`
   tab, named `Recipients_{City}` (e.g. `Recipients_Mumbai`,
   `Recipients_NCR`, `Recipients_Ahmedabad`, ...).
2. Go to the `Config` tab and fill in each `Recipients_{City}` row with
   that city's own client email(s), comma-separated.
3. That's it — `Email.gs::sendDailyReportEmail` now looks up
   `Recipients_{City}` for each city's email; a city with that row filled
   in gets ONLY its own stores sent ONLY to its own recipients. A city you
   leave blank falls back to the shared `ClientReportEmails` — so nothing
   breaks if you haven't filled in every city yet, but it also means an
   unfilled city's data isn't actually isolated to a specific client until
   you fill in its row.
4. Added a new store in a city that doesn't have a `Recipients_{City}` row
   yet? Just re-run `seedCityRecipients` — it only adds rows that don't
   already exist, so it's safe to run again anytime.

### 3a. Loading your master store list

Your master export (`Untitled_spreadsheet_completed.xlsx`) uses a slightly
different raw shape than the `Stores` tab expects:

| Cities | Stores | Latitude | Longitude |
|---|---|---|---|
| Mumbai | BOM_Dahisareast_ANow_TML4 | 19.2574665 | 72.8650191 |
| *(blank)* | BOM_Dahisarwest_ANow_TML3 | 19.2546655 | 72.8538822 |
| *(blank)* | MUM_AmbernarthWest_ANow_TMQ1 | 19.2038 | 73.1867 |

- `Cities` is only filled on the first row of each city group (a
  flattened merged-cell export) — every other row is blank and inherits
  the city above it.
- `Stores` combines the store name and its code — everything after the
  **last underscore** is the store code (`TML4`), everything before it is
  the store name (`BOM_Dahisareast_ANow`).

There are two ways to get this into the `Stores` tab, pick whichever is
easier:

**Option A — use the pre-converted file (fastest).** This project includes
`Stores_import_ready.xlsx`, already normalized from your uploaded export
(94 stores across 10 cities: Mumbai, NCR, Pune, Ahmedabad, Jaipur,
Lucknow, Hyderabad, Bengaluru, Chennai, Kolkata). Open it, copy the data
rows, and paste them into the `Stores` tab starting at `A2`.

> ⚠️ **Data gap in the source file:** one Ahmedabad cell packed 3 store
> names into a single cell (line-break separated) but only carried ONE set
> of coordinates for all three. `AMD_Motera_ANow` (code `TEA2`) kept those
> coordinates; `AMD_Chenpur_ANow` (`TEA6`) and `AMD_Saibabatemple_ANow`
> (`TEA9`) have no coordinates in the source data — they're highlighted
> yellow in `Stores_import_ready.xlsx` (see its `Notes` tab) and will need
> their Latitude/Longitude filled in manually before they can get live
> weather. Everything else — all 92 other stores — has complete data.

**Option B — re-run the importer whenever the master list changes.**
`appscript/ImportStores.gs` does the same City-fill-down + Store-split
transform inside Apps Script (including handling multi-store cells like
the Ahmedabad one above, with a warning logged for any store that ends up
without coordinates):
1. Paste your raw export into a new tab named exactly `RawStores`
   (headers in row 1: `Cities`, `Stores`, `Latitude`, `Longitude`).
2. Select `importStoresFromRaw` in the function dropdown and **Run** — it
   rewrites the `Stores` tab from that raw data.
3. Re-run it any time the master list is updated; it's non-destructive to
   `RainSurgeLog`, `WeatherCache`, or `Config`.

> Two rows in the sample data share the same coordinates under different
> codes (`NCR_Buddhanagar_ANow_TNG9` and `...TNF7`) — that's carried
> through as-is since both are legitimate store codes; the importer only
> warns (via the Apps Script execution log) if it ever sees the same
> **code** reused twice, which would indicate a real data problem.

---

## 4. Weather API key

1. Get a free API key from either provider:
   - [WeatherAPI.com](https://www.weatherapi.com/) (default, `CFG.WEATHER_PROVIDER = "WEATHERAPI"`)
   - [OpenWeatherMap](https://openweathermap.org/api) (set `CFG.WEATHER_PROVIDER = "OPENWEATHER"` in `Config.gs`)
2. In the Apps Script editor, open `Config.gs`, temporarily add a line at
   the bottom: `setWeatherApiKey("your-real-key");`
3. Select `setWeatherApiKey` in the function dropdown, run it once, then
   delete that temporary line (the key is now stored securely in Script
   Properties, not in sheet cells or source code).

---

## 5. Login — no Google Cloud setup needed

Login is a simple name + email form (see the overlay when you open the
dashboard) — there's no Google Cloud Console, OAuth client, or consent
screen to set up. Every login is written to the new `Logins` tab (name,
email, timestamp, browser) via `Sheets.gs::recordLogin_`, so you always
know who accessed the dashboard — click **Access Log** in the navbar to
see it.

**Tradeoff to be aware of:** this is self-declared, not cryptographically
verified — someone could type in a colleague's email. That's a reasonable
tradeoff for an internal tool used by a known team, but if you need to
prevent impersonation, the earlier Google Sign-In (OAuth) flow can be
restored — it verifies the login server-side against Google. Ask if you
want it back; it's a self-contained change (mainly `app.js`'s `Auth`
module and `Code.gs`'s login route).

---

## 6. Deploy the Apps Script Web App

1. In the Apps Script editor: **Deploy → New deployment**.
2. Select type **Web app**.
3. **Execute as:** Me. **Who has access:** Anyone.
4. Click **Deploy**, authorize again if prompted, and copy the `/exec`
   URL.
5. Paste that URL into `config.js` → `CONFIG.APPS_SCRIPT_URL`.
6. Whenever you edit any `.gs` file, you must **Deploy → Manage
   deployments → Edit → New version** for the change to go live — Apps
   Script Web Apps serve whatever was live at the last deployed version,
   not your latest saved code.

---

## 7. VS Code / local development

1. Open this folder in VS Code.
2. Install the **Live Server** extension (or any static file server).
3. Right-click `index.html` → **Open with Live Server**.
4. Confirm `config.js` points at your deployed Apps Script `/exec` URL —
   local dev talks to the *live* Apps Script backend; there is no local
   backend to run.

---

## 8. Production deployment

The front-end is static files only — host them anywhere:
- **Firebase Hosting, Netlify, Vercel, GitHub Pages,** or an internal
  static file server / CDN.
- No build step is required (no bundler, no npm packages) — the files in
  the project root are deployed as-is.

For the backend, no separate deployment is needed beyond the Apps Script
Web App itself — it *is* the production backend, hosted by Google.

---

## 9. Operating rules encoded in the system

- **Hours:** the dashboard is intended for use 6:00 AM – 12:30 AM daily
  (`CONFIG.OPERATING_START` / `OPERATING_END`). Add a client-side guard in
  `app.js` if you want write actions hard-disabled outside this window;
  the midnight auto-shutdown itself is enforced server-side regardless.
- **One active session per store:** `Sheets.gs::rainOn_` throws if a store
  already has an `ACTIVE` row — the UI never lets you open a second one
  for the same store.
- **No duplicate rows:** Rain ON appends one row; Rain OFF updates that
  same row in place and flips `Status` to `COMPLETED`.
- **Midnight sweep:** a time-based trigger fires `autoShutdownAtMidnight()`
  at 12:30 AM IST, which closes every remaining `ACTIVE` row, recalculates
  duration/amount, and triggers the report email — independent of whether
  any browser has the dashboard open.
- **Report emails are per-city, not one combined email — and route to
  per-city recipients.** Each city with sessions that day gets its own
  email — subject `Rainfall Impact on Operations at {City}`, a table of
  Store Name / Surge Amount / Total Duration, and a sign-off using
  `SenderName` / `SenderTitle` / `CompanyName` from the `Config` sheet.
  Recipients come from that city's own `Recipients_{City}` row (see
  Phase 3c) — Mumbai's client only ever sees Mumbai's stores, NCR's
  client only ever sees NCR's, and so on, not a combined list.
- **Buzzer:** rings for exactly 10 seconds (not a continuous loop) —
  automatically when the server detects an active store with no rainfall
  on its 2-minute weather check, and manually any time via the 🔔 button
  on each store card.
- **Weather refresh is every 2 minutes**, not 5. Apps Script's built-in
  timer only allows exact steps of 1/5/10/15/30 minutes — 2 isn't a valid
  option — so `Weather.gs::refreshWeatherForActiveStores` runs on a
  1-minute trigger but only actually calls the weather API once 2 real
  minutes have passed (tracked in Script Properties), giving you an
  accurate 2-minute cadence without wasting API calls every minute.
- **Light / dark mode:** toggle via the 🌙/☀️ button in the navbar. The
  preference isn't persisted across page loads in this build (resets to
  dark) — add `localStorage` yourself once deployed outside of any AI
  tool's preview environment if you want it remembered, or ask and it can
  be added here directly.
- **Billing:** flat rate per session (₹15 / ₹20 / ₹30) via
  `Sheets.gs::computeAmount_`. That function is intentionally isolated if
  you later want pro-rated/hourly billing instead.

---

## 10. Known simplifications (call out before scaling further)

- **IP Address column:** Apps Script Web Apps do not expose the caller's
  IP address to server code, so this column is left blank. If you need
  it, front it with a small Cloud Function/Cloud Run proxy that forwards
  `X-Forwarded-For`.
- **Login is self-declared, not verified:** anyone can type in any
  name/email — there's no password or Google-account check behind it (see
  Phase 5 for the reasoning and how to restore the stronger OAuth flow).
  Fine for a trusted internal team; not fine if the dashboard is ever
  exposed outside that group.
- **CORS:** the client posts as `text/plain` on purpose (see
  `googleSheets.js` header comment) so the browser treats it as a simple
  request and skips preflight, which Apps Script Web Apps don't handle.
  Don't add custom headers to those `fetch()` calls or this will break.
- **500+ stores:** `getStores()`/`buildState_()` read the full sheet range
  on every poll. This comfortably handles 500 stores; if you later grow
  into the thousands, consider trimming `RainSurgeLog` reads to
  today's rows only (add a date-indexed helper sheet) to keep poll
  latency low.
