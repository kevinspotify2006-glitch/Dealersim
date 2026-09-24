# Car Dealership Manager Tycoon

A management/tycoon game about running a car dealership — **your** dealership, which you see, walk around and build. You start with a small used-car lot, €50,000, three cars and one salesperson. Customers walk in from the street, stand by the car they like and wait; you talk to them, offer a test drive and negotiate. You buy stock, inspect it, fix it up on your own lifts, price it and reinvest: in more parking, a showroom, a workshop, a lounge, more land. Over time you can grow into a national automotive group.

It runs in any modern desktop or phone browser, and as an **installable Android app (APK)** that works fully offline. Both use one shared codebase.

> All brands, models, towns, companies and people in the game are fictional.

---

## Features

**The loop:** find a car → evaluate it → buy it (fixed price, haggling or auction) → it arrives and takes a space → inspect → repair on a lift / clean in a detailing bay → price → list (it moves to a space customers can see) → customers walk in and look → talk, recommend, test drive → negotiate → sell (the car drives away) → review → reinvest in the building → hire people into new workstations → expand.

**The dealership is the game.** The home screen is a live top-down view of your lot: zones, walls, doors and windows, parking spaces, showroom displays, lifts, desks, sofas, signs, cars in their spaces with status badges, customers walking, staff at their stations, passing traffic and the light changing towards closing time. Tap anything — a car, a customer, an employee, a fixture, a room — for a compact card with the actions that make sense there. Buying, staff, finances and notifications open as side panels over the dealership (bottom sheets on a phone); only company-wide work (market analysis, reports, loans, locations) has its own screens.

| Area | What's in the game |
|---|---|
| **Vehicles** | 17 fictional manufacturers (Aurelia, Voltara, Nordwerk, Imperium, Castilla, Kitsune and more) and 93 models: hatchbacks, sedans, wagons, coupés, convertibles, SUVs, crossovers, sports cars, supercars, luxury sedans, vans, EVs, hybrids and classics. Every model has its own price band, popularity, performance, luxury, reliability, brand reputation and buyer segments. Each car has a trim, engine, generation, mileage, paint colour, options, true and claimed condition, presentation, hidden defects, history and a seller. Values depend on age, mileage, condition, options, colour, season, market trends, events and brand. |
| **Sourcing** | Wholesale, private sellers, auctions (sealed max-bid against rival dealers), dealer network, special collector auctions, and customer trade-ins. Each source has its own prices, risk and quality. Private sellers and wholesalers can be haggled with. A **model browser** shows every model's type, segment, typical purchase and sale price, estimated margin, demand, popularity and customer segments; show the offers for one model or pay a finder's fee to have your buyer track one down. |
| **Inspection** | A basic look-over on arrival, an optional pre-purchase inspection, and an advanced inspection. The detection chance depends on your mechanics, diagnostic equipment and legacy perks. Undiscovered faults come back later as complaints or warranty claims. |
| **Preparation** | 12 jobs: cleaning, deep cleaning, detailing, paint correction, service, tyres, brakes, cosmetic, interior, minor and major repairs, and pro photos. Each has a cost, a duration and an effect on condition, presentation or listing quality. Workshop bays limit how many jobs run at once. |
| **Customers** | 10 buyer types (budget, family, young, enthusiast, luxury, first-time, business, SUV, EV, commuter). Each buyer has a budget, preferences, price sensitivity, patience, negotiation skill, urgency and sometimes a trade-in. |
| **Negotiation** | Interactive, with a hidden willingness to pay. You read clues (interest, a budget range, mood, patience), then counter, accept or walk away. You can add a warranty, service plan, accessories or finance, and handle a trade-in. Customers counter, run out of patience or ask for free extras. |
| **Staff** | Salespeople, mechanics, detailers, buyers, managers, accountants and marketing specialists. Staff have skill, experience, level 1–5, salary, morale and a specialisation. You can hire, fire, train, promote, give raises, change roles and transfer them. |
| **Dealership (physical)** | A tile grid of land (30×20 m up to 82×50 m; buying land raises rent). Paint areas — car lot, showroom, reception, lounge, office, manager office, workshop, service reception, detailing, parts store, toilets, staff room, storage yard, walkways, landscaping — and walls appear on indoor room edges automatically. **113 placeable objects** in nine categories (structure, showroom, vehicles, office, customer, service, decoration, outdoor, security): walls, glass walls and doors drawn as lines, entrances, windows, pillars; parking, front-row, bargain, premium, EV and visitor spaces; displays, premium and EV displays, turntable; sales, premium, finance, reception and manager desks; lounge, coffee bar, toilets, vending; lifts, tools, detailing, parts shelves; plants, art, logo walls, screens, spotlights, pendants; trees, flowerbeds, fountains, flags, billboards, floodlights, fences; cameras, alarms, bollards, barriers and a security booth. Each has size, rotation, cost, upkeep, power, allowed rooms, unlock level and real effects. Floor, wall and lighting styles for all rooms or per room. Ready-made rooms in one tap, six starting templates, and free placement always. |
| **Space is a resource** | Capacity = spaces actually built; every car stands in one (repairs on a lift, cleaning in a bay, cars for sale where customers can see them). Every employee needs a workstation. Showroom, workshop, detailing, lounge and diagnostics levels come from what stands in those rooms. Customers walk from the entrance: blocked spaces are invisible to them, crowding and long walks lower customer flow. Upkeep, power, rent and security all follow the layout. |
| **Build mode** | A full dealership editor. Search ("desk", "parking", "light", "EV"), category tabs and filters (unlocked, cheap, expensive, small, large, high impact). Drag items from the list onto the map; click, hold and drag placed items to move them, with a transparent ghost that is green (fits), yellow (fits, but blocks a walkway) or red (does not fit), blue selection outlines, grid and snap on/off (snap aligns cars to spaces and fixtures to walls; Alt places freely). Select tool with name, cost, effects, position, rotation and who uses it, plus Move, Rotate, Duplicate, Copy and Delete (expensive items ask first). Undo/redo for every build action, including money. Hover any item, car or model for a tooltip built from the game data. |
| **Cars on the floor** | Drag a car from your stock or from its space onto a display, a parking or front-row space, a premium or EV display, a bargain corner, the prep area — or anywhere on open showroom or lot floor. R turns it 90° while you drag; the ghost shows where it lands and why it cannot. Cars stay exactly where you put them, also after a reload. |
| **Layout effects** | Coffee and lounges raise customer satisfaction; lighting and decor raise showroom appeal; premium cars on premium displays and EVs next to chargers get more attention and better offers; front-row spaces must face the street; visitor parking sets how many customers a day can come; toilets and facilities make them stay longer; premium and finance desks lift sales; a manager office and staff room lift morale; cameras and alarms add security; bad routing lowers customer flow. The dealership info panel lists every effect you have. |
| **Open / closed** | Close the doors (no customers, lower utilities, the team rests) and open again. At closing time a report shows how the day went and what tomorrow brings. |
| **Strategy** | Each location has a strategy (budget, high volume, high margin, luxury, SUV, EV, sports/classics). |
| **Progression** | 7 company levels, from small used-car lot to national automotive company, each unlocking features. There are 19 achievements, and a legacy system: sell the company for permanent perks and start again with a challenge start. |
| **World** | 14 market events (SUV boom, EV boom, fuel spike, downturn, shortage, recalls, competitor openings, fleet auctions, and more), seasons, weekly market trends, and simulated rival dealers with market share. |
| **Marketing** | Six channels with cost, reach, duration, customer mix and measured ROI. Online listings have a quality score. |
| **Finance** | Every euro goes through a ledger. Reports cover day, week, 30 days and 12 months, with charts, a balance sheet, five loan products, monthly rent, salaries, insurance, utilities, taxes, and a recovery path if you go bankrupt. |
| **Expansion** | 8 towns with their own demand, wealth, buyer mix, competition, rent and opening cost. You get per-location performance, vehicle and staff transfers, and can open or close dealerships. |
| **Controls** | PC: drag or WASD/arrows to pan, wheel or +/− to zoom, click to interact, hover for tooltips, B for build mode, R to rotate, Delete/Backspace to remove, Ctrl+Z / Ctrl+Y undo/redo, Ctrl+C / Ctrl+V copy/paste, Ctrl+D duplicate, G grid, Alt to place without snapping, Esc to back out, right-click to stop a tool. Phone: one-finger pan, pinch zoom, tap, drag placed items, long-press a car to drag it, rotate/delete buttons on every card, confirm bar for every build. |
| **UX** | Five destinations — Dealership, Market, Company, Reports, Settings — and a quick action bar (Build, Buy cars, Cars, Customers, Staff, Finances, Time, Alerts). A compact HUD shows cash, today's sales and result, customers, vehicles/spaces, reputation, time and OPEN/CLOSED. Also included: contextual onboarding, help, tooltips, search, filters, sorting, empty states, confirmations, synthesised sound effects and optional music. |
| **Saves** | Autosave (every in-game day and whenever the app is backgrounded), 3 manual slots, and JSON export/import. |

---

## Technology stack

- **TypeScript**, with no runtime dependencies and no UI framework. The DOM is built with a small `h()` helper and the charts and vehicle art are inline SVG.
- **Build:** the TypeScript compiler, plus a 20-line module stitcher (`scripts/build.mjs`) that inlines everything into one `index.html`. There is no bundler dependency.
- **Web:** a static site with a PWA manifest and service worker for offline play.
- **Android:** a native WebView shell (`com.cdmt.game.MainActivity`) that loads the same `index.html` from the APK assets.
  - `tools/apk/build_apk.py` builds and signs the APK **without the Android SDK** (Python 3 + JDK only).
  - `android/` is a standard Android Studio / Gradle project that builds the same app.
- **QA:** a headless simulation test (Node), plus Playwright end-to-end tests at desktop and phone sizes.

## Requirements

| For | You need |
|---|---|
| Playing / web build | Node.js 18+ and npm |
| APK (quick path) | Python 3.8+ and a JDK 11+ (`keytool`, `jarsigner` on PATH) |
| APK (Gradle path) | Android Studio (or the Android SDK command-line tools) with JDK 17 |
| End-to-end tests (optional) | `npm i -D playwright && npx playwright install chromium` |

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

This opens a live-reloading server at <http://localhost:5173> that rebuilds on every change in `src/`.

## Production build

```bash
npm run build      # → dist/web (website), dist/android (single-file game), android/app/src/main/assets/www
npm start          # serve dist/web at http://localhost:5173
```

`dist/web/index.html` is completely self-contained. You can also open it straight from disk.

## Web deployment

Upload the contents of `dist/web/` to any static host (GitHub Pages, Netlify, Vercel, S3, nginx). There's no server component. All paths are relative, so it works from a sub-folder, e.g. `https://you.github.io/car-dealership-manager-tycoon/`.

**GitHub Pages:** run `npm run build`, push `dist/web` to a `gh-pages` branch (or use a Pages workflow that runs the build), and enable Pages for that branch.

## Android

### Option A — build the APK without the Android SDK (fastest)

```bash
npm run apk
```

This builds the game, assembles and signs `release/Car-Dealership-Manager-Tycoon.apk`, then runs `tools/apk/verify_apk.py`, which structurally checks the DEX, manifest, resources and signature.

- On first run a signing key is created at `tools/apk/debug.keystore` (git-ignored).
- To sign with your own key, set `CDMT_KEYSTORE`, `CDMT_KEY_ALIAS` and `CDMT_KEY_PASSWORD` (see `.env.example`).
- Keep using the same key: Android only installs an update over an existing install if it is signed with the same key.

### Option B — Android Studio / Gradle

```bash
npm run build                       # copies the game into android/app/src/main/assets/www
cd android && ./gradlew assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
```

Or open the `android/` folder in Android Studio and press **Run**. The Gradle build targets API 34 and is the right path for a Play Store release: add your own `signingConfig` and run `./gradlew bundleRelease`.

### Installing the APK on a phone

1. Copy `Car-Dealership-Manager-Tycoon.apk` to the phone (USB, cloud drive or e-mail), or run `adb install -r release/Car-Dealership-Manager-Tycoon.apk`.
2. Open the file on the phone. Android asks you to allow installs from that app (Files, Chrome, …). Allow it once.
3. If Play Protect says the developer is unknown, tap **More details → Install anyway**. This is normal for apps installed outside the Play Store.
4. Launch **Dealer Tycoon** from the app drawer.

Your saves stay on the device. The Android back button closes cards, panels, dialogs and build mode and goes back through screens; on the dealership itself it leaves the app. Progress is saved automatically when you switch away.

## Environment variables

None are needed to build or play. The optional variables in `.env.example` only choose the APK signing key and the dev server port:

| Variable | Used by | Default |
|---|---|---|
| `PORT` | `npm run dev` / `npm start` | `5173` |
| `CDMT_KEYSTORE` | `tools/apk/build_apk.py` | `tools/apk/debug.keystore` (auto-created) |
| `CDMT_KEY_ALIAS` | `tools/apk/build_apk.py` | `cdmt` |
| `CDMT_KEY_PASSWORD` | `tools/apk/build_apk.py` | `android` |

## Testing

```bash
npm run typecheck   # strict TypeScript
npm test            # build + headless simulation: six companies play 240 days; economy and save invariants
npm run test:e2e    # Playwright: every screen at desktop and phone size, full dealership playthroughs (tap cars and customers, build, test drive, negotiate, close, save/reload), edge flows, and build-mode QA with mouse and touch (search, filters, place, drag, rotate, duplicate, copy/paste, delete, undo/redo, wall lines, room styles, dragging cars onto spaces and open floor, invalid drops, tooltips, 100+ objects, model browser, save/reload)
npm run balance     # print a one-year balance run of the reference bot
```

## Architecture

```
src/
  main.ts              entry point: registers screens, boots the title screen
  sim/                 the game — pure logic, no DOM (runs in Node for tests)
    types.ts           Vehicle, Customer, Employee, Location, Transaction, Loan, GameState, …
    state.ts           constants, accessors, notices
    engine.ts          the clock: hourly customer flow, daily/weekly/monthly settlement
    market.ts          valuation (true vs. book value), demand, risk, trends
    vehicles.ts        generation, market offers, inspection, preparation
    trading.ts         buying, haggling, auctions, arrivals, listing, pricing, transfers
    customers.ts       footfall, buyer generation, matching, staff deals
    negotiation.ts     interactive negotiation and trade-ins
    sales.ts           closing a sale, satisfaction, reviews, complaints
    staff.ts           hiring, training, promotion, morale
    finance.ts         ledger, company value, loans, monthly costs, taxes
    world.ts           events, competitors, marketing campaigns
    lot.ts             the physical dealership: zones, objects, walls, customer flow, slots, stations, spot bonuses, loose car placement, lines, templates, building
    catalog.ts         model profiles for the model browser and model sourcing
    progress.ts        levels, services, expansion, achievements, legacy
    newgame.ts / save.ts  new games, legacy storage, save slots + migration
  data/                fictional vehicles and all game-design tables
  ui/                  app shell, navigation, views, dialogs, charts, SVG art
    views/world.ts     the dealership screen: canvas, camera, gestures, HUD, action bar, panels, build mode
    world/             renderer, camera, visual people and cars, walking routes, context menus, build palette, undo/redo history, data-driven info cards
  platform/            Android/web glue (back button, autosave hook, haptics) and sound
  styles/              base design system + game layer
scripts/               build and static/dev server
tools/apk/             SDK-free APK builder and verifier
tools/qa/              simulation test, smoke test, playthroughs, edge flows, build-mode QA, perf check
android/               Gradle project (same native shell, Java source)
```

- The **simulation never touches the DOM**. The UI subscribes to a typed event bus (`tick`, `day`, `customer`, `sale`, `levelup`, …) and rebuilds views without losing the scroll position.
- **One code path, three shapes:** the same views render a dense sidebar-and-tables layout on PC and cards, bottom tabs and bottom sheets on phones. Layout decisions happen in CSS where possible and in `ui/layout.ts` where the structure changes.
- **Money is only moved by `record()`**, so the ledger, the reports and the dashboard always agree.

## Save system

- Saves live in `localStorage` (the Android WebView persists it between launches) under `cdmt:*` keys: an autosave, three manual slots and a slot index.
- Autosave runs every in-game day, when the tab or app goes to the background, and when Android pauses the app.
- Everything is saved: the layout (land, zones, every object's position and rotation, styles for all rooms and per room, open/closed), each car's space and state (including cars parked by hand on open floor, with their rotation), each employee's workstation, customers in the building, an open negotiation (it resumes on load), jobs in progress, camera position per location is kept for the session.
- Every loaded save goes through `migrate()`, which validates it, fills in any missing fields, removes duplicates and resets transient state. Saves from before the physical dealership are converted into a real lot big enough for the stock, with the old upgrades returned as a building credit. Old or damaged saves load instead of crashing.
- **Settings → Export save file** writes a JSON file; **Import** loads one on any device, including moving a game between PC and phone.
- Legacy points and perks are stored separately (`cdmt:legacy`) and carry over between companies.

## Built on Business Manager

This game started from the *Business Manager* project: its source was recovered from the shipped source maps and analysed, and its strongest foundations were kept.

Reused:

- the design system: tokens, cards, KPI tiles, tags, buttons, tables that turn into cards on phones, modals, toasts, safe-area handling and touch-target rules
- the `h()` DOM kit
- the SVG icon family
- the SVG charts
- the formatting helpers
- the deterministic RNG and utilities
- the typed event bus
- the real-time engine design (hour accumulator, speeds, daily settlement)
- the app-shell pattern (registered screens, section navigation with a mobile bottom bar and sheets, scroll-preserving rebuilds, held rebuilds while typing)
- the validated save-slot design
- the contextual state-reading tutorial
- the offline service-worker approach

The city map, isometric floor and building designer, rota, logistics, holding, research and retail-specific simulation were irrelevant and were left out. Everything game-specific — the data, the economy, the systems, the screens, the terminology and the visual identity — is new and automotive.

## GitHub setup

```bash
git init
git add .
git commit -m "Car Dealership Manager Tycoon"
git branch -M main
git remote add origin https://github.com/<you>/car-dealership-manager-tycoon.git
git push -u origin main
```

The repository contains no secrets. `node_modules/`, build output, the debug keystore and local environment files are git-ignored. The prebuilt APK in `release/` is committed so the repository includes a ready-to-install build. If you would rather publish APKs as GitHub Releases, delete `release/` and add it to `.gitignore`.
