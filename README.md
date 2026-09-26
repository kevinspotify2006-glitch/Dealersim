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
| **Vehicles** | 23 fictional manufacturers and 151 models: hatchbacks, sedans, wagons, coupés, convertibles, SUVs, crossovers, off-roaders, pickups, vans, sports cars, supercars, luxury sedans, commercial vehicles, EVs, hybrids and classics. Every car has a brand, model, generation, trim, engine, drivetrain (FWD/RWD/AWD/4x4), gearbox, interior, 19 possible options, colour, mileage, service history (full/partial/none), true and claimed condition, a condition grade (New, Like New, Good, Used, Poor, Project, Damaged), hidden damage, history and a seller. Values follow age, mileage, condition, interior, options, colour, season, drivetrain, trends, events, the economy and brand. |
| **Buying** | 10 sources plus trade-ins: trade wholesale, lease returns, private sellers, used-car auctions, fleet disposals, manufacturer (new cars under a dealer contract), importers, other dealers, liquidation auctions and special auctions — each with its own prices, risk, delivery time and a supplier relationship that improves your terms as you keep buying. Haggling, sealed-bid auctions, a model browser and finder's fees. |
| **Selling** | Interactive negotiation against a hidden willingness to pay, four negotiation styles, credit scores, monthly budgets. Trade-ins: inspect, offer low / fair / high, deduct repairs or refuse. Finance: cash, car loan, balloon and private lease with terms, deposit, APR from the economy and the customer's credit, and a real approval decision. F&I: 9 products (warranty, extended warranty, service plan, maintenance, GAP, roadside, accessories, paint protection, detailing pack) with take rates per buyer type and real effects on warranty claims and service visits. Delivery experience options and a delivery bay. Pricing policy per location (aggressive / market / premium) and inventory ageing with automatic repricing. |
| **Test drives** | A playable top-down driving game: tap a car (on the market, in stock, or with a customer) → Test drive, pick a route and drive it yourself — W/A/S/D or arrows, R reset, Esc exit; on a phone a steering stick and GAS / BRAKE, full screen. Every car handles differently from its own data (power-to-weight, weight, body, drivetrain, fuel, gearbox, condition → acceleration, top speed, braking, steering, turning circle, grip). Roads, crossroads, car parks, roundabouts, cone slaloms, buildings and trees you can hit; 3 checkpoints and a finish, a 90 s clock (+30 s when nearly done), "Return to route", crash resets, a HUD and minimap. The result (distance, time, top speed, smoothness, route %, stars) matters: you may feel faults an inspection missed, a customer's purchase confidence moves with how well you drove, and BUY CAR is one tap away. Test-drive knocks never touch the real car. 8 routes (Dealership Loop, Suburban, Industrial, Highway, Scenic, Premium, Performance, EV) unlock through test-drive facilities, plot size, a workshop, a test-drive centre and your specialisation. AI customers still test-drive on their own and react to the car's character ("loved the acceleration", "found it harsh"). |
| **Customers** | 14 buyer types (budget, bargain hunter, family, young, first-time, commuter, enthusiast, luxury, prestige, business, fleet manager, SUV, EV, senior) with age, household, budget, monthly limit, credit, favourite brands, luxury and eco preferences, patience and loyalty. A 12-step funnel (ad → visit → browse → interest → test drive → negotiation → finance → trade-in → sale → delivery → review → repeat), a CRM with lifetime value, and returning clients. |
| **Service department** | 10 service types (maintenance, tyres, brakes, diagnostics, EV work, bodywork, detailing…), capacity from lifts × staff hours, 8 part types with stock, minimums, orders and express delivery, recall work, upsell by service advisors, and service revenue. |
| **People** | 19 roles: sales advisor (senior at level 3), F&I specialist, vehicle buyer, procurement manager, service advisor, mechanic, diagnostic technician, detailer, vehicle prep specialist, photographer, general / sales / service manager, receptionist, marketing specialist, administration, accountant, inventory manager, delivery specialist, security, cleaner. Fourteen skills and traits (sales, negotiation, mechanical knowledge, customer service, speed, reliability, stress resistance, attention to detail, buying, appraisal, finance, EV, luxury, management) with real effects — reliable people are rarely off sick, calm ones stress less, careful mechanics get fewer comebacks. Salary, permanent / temporary / part-time contracts and hours, age, experience, satisfaction, stress, a rolling performance score, the current task, 12 training courses, bonuses, commission and 10 team synergies. Every employee needs a workstation of their kind. |
| **Vehicle buyers** | Give a buyer a brief — budget, brands, segments, fuel, gearbox, years, mileage, maximum price, minimum margin, risk — and they search, appraise, check for hidden damage and haggle every day, then bring you deals to approve, decline or send back for a better price (or buy great ones automatically). Good buyers find more, value accurately and spot faults; weak ones overpay, are optimistic and miss damage. Each buyer's realised margin is tracked against their salary. |
| **Planning** | Every service job, sales visit, test drive and handover is an appointment in a day plan (08:00–18:00 with lunch) with the right person assigned. The workshop works hour by hour: customers arrive at reception, cars wait, go onto a lift, are finished and parked outside ready. Drag blocks to another time or person, move, reassign or cancel them; double bookings, people off sick and more cars than lifts show as conflicts with a one-tap fix. Parts are reserved or ordered for each booking; a full plan turns customers away. |
| **Marketing** | 11 channels (search ads, social, flyers, website, email to your client list, radio, open days, influencers, billboards, sponsorship, premium magazines), three budget sizes, reach, leads, cost per lead, conversion and ROI per campaign. |
| **Brands & contracts** | Become an authorised dealer for a manufacturer: requirements (level, showroom floor, lifts, reputation, trained staff), franchise fee, monthly targets, bonuses, relationship, Silver and Gold tiers, warnings and termination. |
| **Research** | 26 projects in 10 fields (sales playbook, CRM, online sales, fleet sales, digital showroom, advanced finance, credit scoring, online service booking, EV diagnostics, certified pre-owned, loyalty, AI pricing, predictive stock, lean operations, group management…), a queue, prerequisites and costs. |
| **Economy & world** | Consumer confidence, growth, interest rates, fuel prices, EV incentives and import costs move weekly and with 23 market events; seasons and holidays; AI competitors with strategies, price levels, marketing, staff and debt that undercut you, chase hot segments, run promotions, expand and go bust. |
| **Decisions & missions** | 18 decision events with real choices (a fleet order, a viral video, a bad review, a celebrity buyer, a parts shortage, a staff poach, a land offer…) and 38 missions with rewards. 45 achievements. |
| **Fleet** | Business customers in 6 sectors order batches of cars with discounts, deadlines, service contracts and repeat orders. |
| **Dealer group** | Headquarters, 5 central departments (inventory, marketing, HR, finance, service) with two levels each, regional managers, acquisitions of rival dealers (valued from stock, premises, goodwill and debt), rebranding and liquidation. 14 towns of 5 location types. |
| **Brand identity** | Your colour, logo and brand promise: signs and flags on the lot carry them, and the promise changes which buyers come. |
| **Dealership (physical)** | A tile grid of land. 22 room types (showroom, reception, lounge, finance office, delivery area, office, manager office, workshop, service reception, detailing, parts, toilets, staff room, storage, test-drive centre, marketing studio, training room, road & driveway, lot, walkways, landscaping, bare land) and **199 placeable objects** with size, rotation, cost, upkeep, power, capacity, audience, unlock level, effects and 34 layout synergies (a finance desk next to a sales desk, promo displays by the showroom cars, a waiting area by the service desk, a VIP lounge by premium displays, a check-in desk by the test-drive bays…). Rooms are recognised by what stands in them: a complete room (the right furniture and a door) adds its function — offices productivity, lounges satisfaction, a marketing studio campaign power, a training room faster courses, a test-drive centre better test drives. Plots grow from a Starter plot to Medium, Large, Mega and the Automotive Complex: the land for sale is drawn around your lot with a lock and its price — tap it to expand, everything you built stays. 7 dealership styles (Modern, Industrial, Classic, Minimal, Premium, Sport, Luxury) change the look, who comes in and your reputation; the building itself says what you are (retail, service, luxury, EV, used-car, performance or family focused) and matching your specialisation brings more visitors. Customer, delivery and service routes (entrance → parking → showroom → sales → exit; delivery → parking → showroom; entrance → service desk → workshop → inspection → ready) are checked live. |
| **Build mode** | Four modes — Build, Move, Bulldoze and Bulldoze area. Bulldozing shows build cost, refund (50–70% by type, age, condition and upgrades) and net cost, and warns before you remove the only entrance, reception, sales desk or a busy lift; an area bulldoze marks everything in the rectangle first and can clear the floor too. Tap anything built for Move / Rotate / Duplicate (the copy follows your cursor or finger) / Upgrade (Lv 2–3 with real effects: faster lifts, more attention on displays, better receptions…) / Bulldoze / Info. 14 placeable room templates (small showroom, basic workshop, premium reception, staff office, EV center, service center, used-car area, VIP area, test-drive center…) and Create room (drag a rectangle, the type is suggested from what stands there, walls and a door appear). Every build action, land purchase and bulldoze goes through undo/redo. 19 categories that never get cut off (they wrap on wide screens and scroll with arrows on phones): All, Rooms, Structure, Showroom, Vehicles, Customers, Staff, Service, Finance, Marketing, Storage, Decoration, Exterior, Parking, EV, Technology, Security, Premium — plus floors & ceilings, land and templates. Search matches names, categories, descriptions, tags, effects, functions, roles, rooms, unlocks, prices (`<500`, `>5000`) and car types; 13 filters; tooltips with price, size, unlock, upkeep, capacity, effects, synergy, requirements, who it matters to and who uses it. Drag and drop, ghost previews, snap, grid, undo/redo, copy/paste, templates, and cars dragged onto the floor. |
| **Reports** | Key figures (revenue, gross and net profit, cash flow, stock value and age, conversion, leads, finance penetration, service revenue, marketing ROI, staff cost, rent, operating costs) with charts, finances, sales, visitors, stock, economy and dealership reports. |
| **UX** | The dealership is the game: tap a car (price, purchase price, margin, status, preparation, interest, options, demand), a customer (mood 🟢🟡🔴, needs, budget, finance, appointment, history, the car they might buy) or an employee (role, skills, salary, current task, today's plan, satisfaction, performance). Customers' service cars arrive, wait, go onto the lifts and are parked outside when ready, with small animations for sales, repairs, bookings and purchases. Six sections — Dealership, Inventory, People, Service, Business, Settings — with tabs inside (swipe between them on a phone), a compact status bar (cash, today, stock, staff, workshop, reputation), visual stock cards, and smart notifications with the action on them (approve a buyer's deal, fix the schedule, assign an advisor, decide). PC: mouse, wheel, keyboard shortcuts and hover tooltips. Phone: touch targets of 44–48 dp, bottom sheets, long-press drag, pinch. |
| **Saves** | Autosave (every in-game day and whenever the app is backgrounded), 3 manual slots, JSON export/import, and automatic migration of older saves. |

---

**Mobile first (v7).** On a phone (Galaxy S25 Ultra portrait is the reference, 360–480 px and tablets are covered, landscape keeps an icon rail) the game is laid out as a native tycoon app:

- *Header* — one compact card with cash, today's result, cars and staff, plus play/pause and the notification bell. Tap the card for the dealership status sheet (date, speed 1×/2×/4×, next day, all key figures as shortcuts).
- *Bottom navigation* — six sections with icon, label, active pill and badges, above the gesture bar. Business has a single tab row with a group picker.
- *Bottom sheets* — every dialog slides up from the bottom with a grip; drag it down or tap × to close.
- *Map first* — the dealership fills the screen; the quick-action bar floats, zoom is pinch (only a small "fit" button remains).
- *Build mode* is its own UI state (`GameMode`): the app header and navigation step aside for a build top bar (← · Build · cash · undo · redo · ⋯ · ✓ Done), three big modes (Build · Move · Remove, with One object / Area), one category row with a search that expands and a filter sheet (availability, price, size, required level, category), and a catalog sheet you pull between peek, half and full. Cards show icon, name, price, size, effect, a short description and — for locked items — exactly why; tapping a locked item explains it. Placing folds the catalog away and shows a placement bar: what it is, whether it fits (and why not), and big Rotate / Cancel / Place buttons.
- *Contextual cards* — tapping a car, an employee, a fixture or a room shows a compact card with its one key line (price · status · margin, a performance bar, level and occupant) and its actions; **Manage** unfolds the full details.
- *Mobile screens* — Inventory shows vehicle cards (purchase, market value, asking price, potential profit, status, Manage); People shows employee cards (performance and satisfaction bars, salary, status, Manage); Service opens with open jobs, vehicles waiting, mechanics, revenue and a capacity bar; Business opens with the month's profit and five key cards. Settings moved out of the bottom bar into the status sheet (header card → Settings & saves).
- *Placement* — a new item appears straight away as a preview on a free spot; drag the preview with a finger (drag elsewhere pans), tap to move it, Place builds it with a small "✓ placed" animation, and the next preview waits so rows go fast (Cancel turns into Done). The build drawer resizes by its grip or a vertical swipe on the mode bar; collapsed it is only the Build / Move / Remove toolbar.
- The mobile UI layer lives in `src/ui/mobile/` (CompactHUD and status sheet, BottomSheet / StatsCard / Meter / KeyValue components, VehicleCard / EmployeeCard, Business and Service summaries) and `src/ui/mode.ts` (GameMode), on top of the shared game state and systems.
- Notifications are one slim card at a time (swipe to dismiss); everything waits in the notification center.
- Touch targets are 44–54 px, with haptics and pressed/disabled states. The APK runs immersive full screen and respects cutouts and safe areas.

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

The APK runs **full screen and immersive**: no status bar and no navigation bar (swipe from an edge to show them briefly), drawn edge to edge around the camera cutout, with safe margins so nothing sits under the cutout or the rounded corners. It restores itself after resuming, regaining focus, rotating and after dialogs, keeps the screen awake while you play, and works in portrait and landscape.

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
npm test            # build + headless simulation (six companies play 240 days; economy and save invariants) + build-system checks (catalogue, bulldoze refunds, area bulldoze, upgrades, land, every room template in both rotations, styles, flows) + test-drive checks (every route driven to the finish by four cars, handling differences, brakes, steering, collisions, resets, timer) + migration of version-3, -4 and -5 saves
npm run test:e2e    # Playwright: full playthroughs (desktop and phone), edge flows, the v4 systems through the UI (research, pricing, delivery, parts, campaigns, staff, fleet, decisions, demo cars, identity, finance, test drives), the v5 systems (six-section navigation and swipe, status bar, vehicle buyers from brief to approval and from a notification, planning drag / move / conflict fix, contracts, customer mood and assigning an advisor), build-mode QA with mouse and touch, the v6 systems (Build / Move / Bulldoze / Area modes, refund and safety dialogs, undo/redo, buying locked land on the map, templates, create room, upgrades, styles, and the test drive with keyboard and touch controls, checkpoints, result, buy after the drive and a customer drive), build-tab clipping at desktop, laptop, tablet and Galaxy S25 Ultra portrait/landscape, every screen at four sizes (no sideways scroll, every screen reachable in ≤ 3 taps), and the v7 mobile UI (compact header and status sheet, play/pause, notification center, drag-to-close sheets, bottom navigation, group picker, build mode as its own state with top bar, three modes, sheet sizes, search, filter sheet, locked items, insufficient funds and the placement bar)
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
    world.ts           events, competitor AI, marketing campaigns
    systems/           economy, retail finance & F&I, CRM, service & parts, planning (appointments, hourly workshop, conflicts), procurement (vehicle buyers), research, brand contracts, decisions, fleet, missions, dealer group, inventory ageing, save initialisation
    lot.ts             the physical dealership: zones, objects, walls, customer flow, slots, stations, spot bonuses, loose car placement, lines, templates, building, rooms, upgrades, refunds, unlocks, land
    buildplus.ts       bulldoze (single and area, safety checks), upgrades, room templates, create room, styles, identity, site flows, capacity
    testdrive.ts       what a drive you drove yourself means: fuel, faults you feel, customer confidence, AI drive feedback
    catalog.ts         model profiles for the model browser and model sourcing
    progress.ts        levels, services, expansion, achievements, legacy
    newgame.ts / save.ts  new games, legacy storage, save slots + migration
  drive/               the test-drive game without DOM: track builder (roads, crossings, roundabouts, car parks, slaloms, scenery), arcade physics per car, the session (clock, checkpoints, crashes, scores) and routes
  data/                fictional vehicles and all game-design tables (products, service, research, decisions, missions, group, build categories)
  ui/                  app shell, navigation, views, dialogs, charts, SVG art
    views/world.ts     the dealership screen: canvas, camera, gestures, HUD, action bar, panels, build mode, feedback animations
    views/tabs.ts      the section hubs (grouped tabs, swipe)
    views/procurement.ts, views/planning.ts, views/staff.ts   buyers, the day plan, the team and recruitment
    notify.ts          smart notifications with actions
    drive/driveview.ts the full-screen test drive: route picker, canvas, HUD, minimap, touch/keyboard controls, result
    world/             renderer, camera, visual people and cars, walking routes, context menus, build palette, undo/redo history, data-driven info cards
  platform/            Android/web glue (back button, autosave hook, haptics) and sound
  styles/              base design system + game layer
scripts/               build and static/dev server
tools/apk/             SDK-free APK builder: hand-assembled DEX (immersive fullscreen shell), manifest, resources, signing, and a verifier with a DEX type-flow check
tools/qa/              simulation test, build and drive checks, save migration (v3, v4 and v5 fixtures), smoke test, playthroughs, edge flows, v4, v5 and v6 flows, build-mode QA, build-tab clipping, all-screens QA, perf check
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

The city map, isometric floor and building designer, rota, logistics, holding and retail-specific simulation were irrelevant and were left out; research, decisions and group management were rebuilt from scratch for car dealing. Everything game-specific — the data, the economy, the systems, the screens, the terminology and the visual identity — is new and automotive.

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
