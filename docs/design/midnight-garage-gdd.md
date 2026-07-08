# MIDNIGHT GARAGE
## Game Design Document — v0.5

**Genre:** Medium-weight management sim with light idle elements
**Platform:** Browser (desktop-first, playable on mobile)
**Aesthetic:** Vibrant synthwave pixel art
**Reference points:** Fiz: The Brewery Management Game (weight/loop), Game Dev Story (charm/staff), Gran Turismo 2's used car lot (the fantasy of the hunt)
**Working title alternates:** Kaido Garage, Shakotan Dreams, Wangan Works

---

## 1. Vision

### 1.1 The Pitch
It's 1995 in Neo-Karuizawa, a fictional Japanese city at the foot of a famous mountain pass. You've just leased a two-bay garage with rusted shutters and a neon sign that only half works. Your dream: hunt down Japan's greatest performance cars at auction, restore and build them, earn the respect of the street, and one day enshrine all ten Legends in your own showroom.

### 1.2 The Fantasy
The player is a **hunter-curator-craftsman**. The emotional core is not "number go up" — it is:

1. **The Hunt** — spotting an undervalued rough-condition legend in an auction listing.
2. **The Build** — making real, flavorful decisions about what a car becomes (period-correct restoration? 400hp street monster? style-first show car?).
3. **The Respect** — the city noticing. Magazine features, meet invitations, rivals nodding at you.

### 1.3 Design Pillars
1. **Every car is a story.** Cars are individuals with history, quirks, and provenance — never interchangeable inventory.
2. **Decisions, not clicks.** Fiz-weight: a session is 20–40 minutes of meaningful choices. No cookie-clicker tapping, no energy timers.
3. **Culture is the content.** Chassis codes, buyer subcultures, touge nights, shaken inspections — authenticity is the differentiator against generic garage tycoons.
4. **The vibe is a feature.** Synthwave pixel art, rain on neon, eurobeat on event nights. The game should feel like a VHS tape found in a Silvia's glovebox.

### 1.4 Explicit Non-Goals
- No real-time waiting, energy systems, or monetized timers.
- No driving/racing gameplay (races resolve via management decisions + stats).
- **No reflex-based input anywhere** — no QTEs, no timing bars. Every mechanic is decision-paced (accessibility as a hard rule).
- No individual-bolt mechanic sim. Depth lives in *choices about parts*, not labor minigames.
- No multiplayer in v1.0 (async leaderboards are a post-launch candidate).

---

## 2. Setting, Tone & Legal Framing

### 2.1 Setting
**Neo-Karuizawa, Japan — starting in 1995.** Districts unlock with reputation:

| District | Unlocks | Flavor |
|---|---|---|
| Portside (start) | Local auction yard, parts bazaar | Rusty shutters, vending machines, sodium lights |
| Shōtengai | Customer commissions, magazine office | Shopping arcade, izakaya neon |
| The Wangan Strip | Regional auction, night meets | Highway overpasses, hot pink signage |
| Mt. Kirifuri | Touge events | Misty hairpins, guardrail scars |
| Collector's Quarter | Invite-only auctions, Legend leads | Old-money garages, white gloves |

### 2.2 Era Progression (light touch)
The calendar advances ~2 in-game years per reputation tier (1995 → 2005 over a full campaign). New model years appear at auction over time; early cars get rarer and appreciate. This creates a natural "buy it when you see it" tension without heavy simulation.

### 2.3 The Player Character — silent-ish, world does the talking
The protagonist is a **minimal-dialogue avatar**: no monologues, no quips. Personality lives in a small recurring cast who talk *at* you — the retired mechanic landlord, the parts bazaar auntie, the Rival — plus occasional 2–3 option replies (dry / earnest / hungry) that add flavor and tiny rep shading but never gate content. Likeable through restraint: the player projects, the world charms. If a line risks being annoying, it gets cut.

### 2.4 Real Cars & the Licensing Reality
**Design intent: real cars, real names, real specs.** An '84 Honda City should be an '84 Honda City.

The legal facts (not legal advice): factual specs and chassis codes are unprotectable data — the game's simulation layer is safe. Model names are trademarks and vehicle likenesses are protected trade dress; this is why even funded commercial titles license manufacturers (and ship knockoffs when a manufacturer declines). Enforcement against a free indie browser game is unlikely but nonzero; monetization raises the stakes.

**Mitigation — the Naming Layer:** every vehicle's data record separates `spec` (real, immutable) from `display_name` / `brand` (swappable strings). The game is developed and balanced entirely on real data. A single config flag can ship parody names ("Toyoda Suprema JZA80") without touching gameplay. Decision deferred to release; nothing is lost by building real-first. Sprites are original pixel interpretations at 96px — low-res stylization is itself meaningful distance on trade dress.

Parts brands ship as light parodies from day one ("KHS," "Tanuki Suspension," "Vulk Racing TE37-style") — that's where trademark risk is highest and parody is part of the charm anyway.

---

## 3. Core Gameplay Loop

### 3.1 Time System — Turn-Based Days
The day advances **only when the player ends it.** One day = one turn. A week is 7 turns; rent, wages, and market ticks resolve weekly. A typical session comfortably covers 5–15 days.

**Day structure (soft phases, all available until End Day):**

1. **MORNING — The Mail & The Market.** Read mail (auction catalogs, commission offers, event invites, rumors). Browse today's listings.
2. **WORKDAY — The Garage.** Assign staff and yourself to jobs. Each job consumes **labor slots** (see 3.2). Buy parts, order deliveries.
3. **EVENING — The Scene.** Optional: attend a meet, enter a touge night, take a private buyer meeting. One evening action per day.
4. **END DAY.** Work progresses, deliveries arrive, passive income resolves, events fire, autosave.

### 3.2 Labor Slots (the core resource)
Each character (player + staff) provides labor slots per day (base 2, more with skill/tools). Jobs are defined in labor-slot costs, e.g.:

- Inspect an auction car properly: 1 slot (else you bid on photos alone — risk!)
- Swap coilovers: 1 slot
- Engine rebuild: 6 slots (spread across days)
- Full restoration of a rough Legend: 25–40 slots

This makes "what do we work on today?" the central daily decision — the Fiz-style planning crunch.

### 3.3 The Loop, One Sentence
**Hunt** cars and parts at auction → **build** them in the garage against a plan → **sell** to the right buyer, **keep** for the collection, or **campaign** them at events → convert profit and reputation into better access, staff, and tools → hunt bigger.

### 3.4 Light Idle Elements (exactly two)
1. **The Service Bay.** Once staffed, routine customer work (oil changes, shaken prep) auto-resolves each End Day for passive income scaled by staff skill and shop rep. It is a background hum, never the focus.
2. **Part Scouts.** Send a contact on a multi-day hunt ("find me a genuine '92 rear wing"). Results arrive in the mail. Fire-and-forget with a delightful payoff.

Both respect the turn-based frame: nothing happens while the browser is closed. "Idle" means *delegated*, not *waiting in real time*.

---

## 4. Cars

### 4.1 The Car as an Object
Every car instance carries:

- **Model + chassis code** (from a roster of ~40 real models at v1.0, incl. 6–8 Gaisha; real specs per §2.3)
- **Year, mileage, color, provenance note** ("one-owner, garage kept, Gunma plates")
- **Condition** per zone: Engine / Drivetrain / Suspension / Body / Interior, each 0–100
- **Hidden issues** revealed only by inspection (rust in the rails, blown turbo seals, accident history)
- **Authenticity %** — how period-correct/stock the car is (collectors pay for this; tuners don't care)
- **Build sheet** — every installed part, visible as a spec list

### 4.2 Derived Stats (shown as a radar chart)
**Power • Handling • Style • Reliability • Authenticity.** All five are derived from platform base + parts + condition + tune. No hidden math the player can't reason about.

### 4.3 Rarity Tiers
| Tier | Examples | Role |
|---|---|---|
| Shitbox | '84 Honda City E (AA), Nissan Sunny B12, Carina AT150, Mira L70 | Act 1 service jobs, first ¥150k flips, beloved trash |
| Common | Civic EG6, Miata NA6, 180SX, Levin AE92, MR2 AW11 | Bread-and-butter flips, first real builds |
| Uncommon | Silvia S14, AE86 Trueno, MR2 SW20, Civic EK9, RPS13 | Buyer favorites, event cars |
| Rare | Supra JZA80, RX-7 FD3S, Lancer Evo V, Impreza 22B, R32 GT-R | Big flips, big power platforms, rep makers |
| Gaisha | See §4.5 | Import prestige, late-game flex |
| Legend (×10) | R34 GT-R V-Spec, NA1 NSX-R, hakosuka KPGC10, S2000 AP1, AZ-1, FD3S Spirit R, etc. | The collection. See §9 |

**Full inspiration pool, PoC-10 picks, go-live roster and expansion packs live in the companion document `midnight-garage-roster.md`.** All entries use **real specs**: correct engine codes (E-series, B16B, SR20DET, 2JZ-GTE, 13B-REW, RB26DETT), real curb weights, real stock outputs — the sim is built on truth (see §2.3 for the naming layer).

### 4.4 Platform Tags
Every model carries tags — **FR / FF / AWD / MR, Turbo / NA / Rotary / Kei, decade, JDM / Gaisha** — which drive part compatibility, buyer preferences, and event suitability. Tags are the simple system that makes depth legible.

### 4.5 Gaisha (imports)
A curated late-game channel of **period-correct beloved imports** — the cars a 90s Japanese enthusiast actually revered:

- Mercedes-Benz 190E 2.5-16 Evolution II
- BMW M3 (E30)
- Lancia Delta HF Integrale Evo
- Porsche 911 Turbo (930)
- Alfa Romeo 75 / Mini Cooper (affordable gaisha entries)
- Ferrari F355 (one-off Collector's Quarter appearance)

**Mechanics that make imports feel foreign:**
- Sourced only via the **Import Broker** (unlocks at Respected rep) — no auction luck, long lead times, landed-cost premium.
- **Parts scarcity:** no local shelf stock; every part comes via scout dispatch with multi-day shipping. Repairs cost more labor (unfamiliar engineering; a *Gaisha-fluent* staff trait negates this).
- **LHD quirk** and shaken paperwork flavor on the build sheet.
- A dedicated **Gaisha buyer archetype** (doctor/executive money: pays huge for condition + provenance, zero interest in modification — high Authenticity only).
- Kept deliberately limited: ~6–8 models, never the core loop, always an occasion.

---

## 5. Parts & Building (depth level: 2.5)

### 5.1 What a Part Is
Parts are **named, branded (parody), graded items** with their own condition:

> **KHS TR-500 Turbo Kit** — Engine slot • Grade: Sport • Requires: Turbo-tag platform • +Power ++, −Reliability −, used (72%)

### 5.2 Slot Model
Seven slots per car: **Engine, Forced Induction, Drivetrain, Suspension, Brakes, Body/Aero, Wheels/Interior.** Each slot holds one package-level part (a "turbo kit," not a wastegate). Grades: **Stock → Street → Sport → Race**.

### 5.3 Compatibility & Swaps
- Parts require matching platform tags. A rotary header doesn't fit a piston car; an AWD gearset needs an AWD platform.
- **Engine swaps** are the marquee deep mechanic: any engine can go in any platform *if* you source/fabricate a mounting kit (expensive, high labor, small permanent Reliability tax if cross-family). Swaps tank Authenticity but unlock monster Power ceilings. The classic tension: restore the numbers-matching engine, or drop in the big turbo lump?
- **Used parts** are cheaper, findable at meets/scouts, and carry condition risk. Genuine period parts add Authenticity; reproductions don't.

### 5.4 The Tune (simplified dyno — the "3" part of 2.5)
After a build changes, run a **dyno session** (1 labor slot): a single screen with 2–3 sliders (e.g., Boost ↔ Reliability, Camber: Grip ↔ Tire wear/Style). A pixel-art dyno chart animates the result. This is where the "between 2 and 3" lands: real tradeoff decisions, zero part-by-part micromanagement.

### 5.5 What We Deliberately Don't Simulate
Individual gaskets, torque specs, fluid types, per-bolt disassembly. Labor slots + part condition abstract all of it.

---

## 6. Economy & The Market

### 6.1 Money In
1. **Flipping** — buy rough, restore/build, sell to the right buyer.
2. **Commissions** — customers bring a car + a brief + a budget ("make my S14 analog a touge weapon, ¥900k"). Score vs. brief drives payout and rep.
3. **Service Bay** — passive (see §3.4).
4. **Event winnings** — touge/show purses (modest cash, big rep).

### 6.2 Money Out
Rent (weekly), wages (weekly), parts, auction purchases, transport fees, event entry, loan interest.

**Currency is era-authentic yen everywhere** — ¥2,500,000 on a fax-paper invoice hits different than "2,500cr". Numbers formatted with man/千 flavor in dialogue, plain digits in ledgers.

### 6.3 Buyer Archetypes (who you sell to matters)
| Buyer | Pays for | Ignores |
|---|---|---|
| **Collector** | Authenticity, Condition, Legend/Rare tier | Power |
| **Tuner** | Power, quality Sport/Race parts | Authenticity |
| **Stancer** | Style, wheels, rarity of cosmetics | Reliability |
| **Racer** | Handling + Reliability balance | Style |
| **First-timer** | Cheap, reliable Commons | Everything else |

Selling is a mini-decision: list publicly (slow, market price), sell to a walk-in offer (fast, variable), or match to a known buyer contact (best price, uses relationship).

### 6.4 Market Heat
Each model has a demand index that drifts weekly and spikes on events: a magazine cover, a movie release ("*Midnight Wangan* premiered — kaido racer prices +40%"), a famous touge victory. Rumors in the morning mail telegraph some spikes, rewarding attention. This is the game's "stock market" — light, readable, flavorful.

### 6.5 Auctions (the crown jewel screen)
- **Tiers:** Local Yard → Regional Auction → Premium Auction → Collector Network (rep-gated).
- Weekly catalogs; each lot shows photos, mileage, an auction grade (paperwork), and *hints* ("smokes on startup").
- **Inspection** (1 labor slot + travel fee) reveals hidden issues before bid day.
- **The deal prices in the risk (sliding-scale lemons):** hidden-issue variance scales with discount from book value. Buy at a fair price and downside is capped — surprises are annoyances, not showstoppers. Buy a suspicious steal and the variance opens *both ways*: it's either a lemon (rusted shell, cracked block) or a goldmine (undisclosed rare options, genuine low mileage, one-owner history). Uninspected bargains are the game's slot machine — but a fair, honest purchase is always safe enough to learn on.
- Bidding is a simple tense escalation vs. 1–3 AI bidders with visible personalities. Sniping a Legend under book value should feel like the best moment in the game.

### 6.6 Failure & Pressure
Miss rent/wages twice → forced loan at painful interest → deep debt triggers **repossession of your highest-value non-enshrined car**. No game over; losing a car you loved *is* the punishment.

---

## 7. Staff

- Hire up to **4 staff** (start: just you). Found via job ads, poached at meets, or story hires.
- Stats: **Engine / Chassis / Body / Hustle** (1–5 wrenches) + wage + **one trait**, e.g.:
  - *Ex-pro driver:* +touge results, demands the keys sometimes
  - *Auction rat:* free inspections at Local Yard
  - *Perfectionist:* +quality, −speed
  - *Night owl:* +1 slot if you attended an evening event
- Staff level up in what they do (light, capped). No morale meters or scheduling sim — traits and assignment choices carry the personality.

---

## 8. Events & The Scene (evening actions)

| Event | Cadence | Play |
|---|---|---|
| **Night Meet** | Weekly | Show a car → rep + buyer contacts + used-part stalls. Style-heavy cars shine. |
| **Touge Night** | Bi-weekly | Enter car + driver (you/staff). Pre-run decisions only — pace dial (*cruise / attack / send it*), tire choice, driver instructions. Resolves **sector by sector** in an animated pixel cutaway with live gap readout — spectacle and tension with zero player input mid-run (no QTEs). Damage is real. |
| **Show & Shine** | Monthly | Style/Authenticity contest. Judged categories rotate. |
| **Magazine Shoot** | Invitation | Feature a build → big rep + market heat spike for that model. |
| **Private Meetings** | As offered | Collector leads, rival wagers, shady part deals (cheap, provenance risk). |

**The Rival:** a mirrored AI shop ("Garage Tempest") that bids against you at auctions, campaigns at touge nights, and occasionally offers to buy your cars. Beating them is a rep multiplier; they keep sandbox mode alive.

### 8.1 The Gentlemen's Agreement (280 PS) — a living easter egg
The real-world 1989–2004 pact — Japanese manufacturers advertising no more than 280 PS regardless of truth — becomes a game system:

1. **The Wink on the Spec Sheet.** Every JDM performance car from 1989–2004 shows **"280 PS ※"** as its advertised power in listings and catalogs. Its *true* stock output is hidden until you dyno it. Some cars are famously underrated (a stock JZA80 or R34 pulling well over 300 on your dyno, the needle sweeping past 280 with a little "…gentlemen?" toast popup), some tired examples embarrassingly under. Auction listings for this era therefore never tell you real power — insider knowledge and inspection are rewarded, and the first time a new player dynos a "280 PS" car and watches it lie is the easter egg discovering *them*.
2. **The Gentleman's Class.** A recurring Show & Shine category: enter a car whose dyno reads **exactly 276–280 PS**. Precision-tuning down to the agreement number is a fun inversion of the power chase. Trophy: *"A Gentleman Never Tells."*
3. **The News Event (2004).** When era progression reaches 2004, the morning fax reports the agreement's end — the market immediately begins honest power advertising, big-power cars spike in heat, and a one-time achievement unlocks if you're holding any 300+ PS-actual "280 PS" car: *"We All Knew."*

---

## 9. Progression & The Legendary Collection

### 9.0 The Climb (progression arc — a core pillar)
The game must *feel* like climbing from grease-stained nobody to Wangan royalty. Four acts, each changing what a "job" even is:

| Act | Rep | What you're doing | Signature moment |
|---|---|---|---|
| **1. Oil & Rust** | Unknown → Local | One-off service jobs ARE the gameplay: an oil change on an '84 Honda City, a clutch in a Sunny, shaken prep on a rusty Mira. Flip your first ¥150k shitbox. | First flip profit covers rent for the first time |
| **2. Street Name** | Local → Known | Real commissions with briefs and budgets. First turbo builds, coilovers, first meet trophy. Service jobs start delegating to staff. | A customer asks for *you* by name |
| **3. Big Power** | Known → Respected | Engine swaps, 400–600hp builds, touge campaigns, Import Broker opens, the Rival notices you. Service bay fully passive. | First dyno pull past 500hp |
| **4. Works Level** | Respected → Legend | **1000hp Wangan-spec JZA80 top-speed builds. Full time-attack works cars** (R32/R34 with aero you fabricate in-house). Legend restorations. | Your car on a magazine cover |

**How the gate works — Tools, not levels.** Job tiers are unlocked by shop equipment purchases, each a visible pixel upgrade in the garage: **Basic tools → Two-post lift → Dyno cell → Engine crane & stand → TIG welder/fab corner → Aero/composites bench.** You can't build what you can't lift. Equipment + staff skill + rep gate the ceiling; money alone never skips the climb.

**Power ceiling by act:** stock-ish (Act 1) → ~250hp street (Act 2) → ~600hp (Act 3) → 1000hp+ full race (Act 4). High-hp builds demand supporting mods (fuel, cooling, drivetrain grades) or Reliability collapses — a 1000hp build is a *project*, ~40 labor slots of earned mastery.

**The Service Bay evolves with you:** in Act 1 those small jobs are hand-played job cards (pick the work, assign the slots, tight margins). As staff arrive they absorb them, until by Act 3 the bay is the passive hum described in §3.4. The idle element is literally *your own past gameplay, delegated* — that's the progression fantasy made mechanical.

**Late-game events unlock in Act 4:** **Wangan Top-Speed Night** (terminal-velocity runs; Power/Reliability heavy, high damage risk) and the annual **Attack Fest** time-attack (the WTAC fantasy: purpose-built aero monsters, one flying lap, national leaderboard vs. AI works teams).

### 9.1 Reputation Tiers
**Unknown → Local → Known → Respected → Legend** (5 tiers, mapping to the acts above). Rep gates: auction access, districts, staff quality, commission budgets, Legend leads. Rep comes from great builds delivered, events, features — not raw cash.

### 9.2 The Hall of Legends (win condition)
Ten Legend cars exist. Acquiring one is an event in itself — some appear once at Collector Network auctions, some come from story leads ("an old man in the Quarter has a hakosuka under a tarp"), one is the Rival's personal car.

To **enshrine** a Legend in your showroom it must reach **90+ average condition** and either **95+ Authenticity** (period-correct restoration) *or* a **Signature Build** (all-Race-grade, dyno-proven — your masterpiece interpretation). Player chooses the philosophy per car.

Enshrined cars are permanent (can't be repossessed or sold), grant a small daily rep/income aura, and fill the Hall — a single lovingly-rendered pixel showroom scene that grows from empty warehouse to museum.

### 9.3 Endgame → Sandbox
Enshrining the 10th Legend rolls credits over the completed Hall. Sandbox continues seamlessly: era keeps advancing (2005+ models appear), the Rival escalates, a **New Game+ "Second Shop"** prestige option unlocks (restart with one enshrined car and a trait bonus).

---

## 10. Art & Audio Direction

### 10.1 Visual
- **Pixel art at 480×270 logical resolution**, integer-scaled; chunky readable sprites, cars ~96px long in garage view, side-profile (the classic tuner-catalog angle).
- **Palette:** deep indigo/violet nights, teal shadows, hot-pink and cyan neon, amber sodium streetlights; rain-slick reflective asphalt as a signature motif.
- Every car color/part visually represented on the sprite (wheels, aero, ride height, livery). The build sheet must be *visible*.
- Optional CRT/scanline + VHS grain toggle.
- UI skinned as period ephemera: auction catalogs are print pages, mail is fax paper, the market is a teletext screen.

### 10.2 Audio
- **Base layer:** synthwave/chillwave loops (garage by day, neon rain by night).
- **Event layer:** eurobeat-inspired originals for touge nights; city-pop flavor for meets.
- Chunky mechanical SFX: ratchet clicks, shutter doors, distant idle burble; a satisfying "kachunk" on End Day.

---

## 11. Screens (v1.0)

0. **City Map** (navigation): a semi-animated pixel map of Neo-Karuizawa — glowing district nodes, drifting clouds over Mt. Kirifuri, day/night tint, tiny traffic. Functionally a fancy menu (one click = one screen, zero friction), locked districts visible but dark.
1. **Garage** (hub): bays with current cars, staff visible working, service bay, door to street.
2. **Car Detail / Build Sheet**: radar chart, slots, condition zones, job queue.
3. **Auction House**: catalog → inspection → live bid.
4. **Market & Mail**: teletext market heat, fax inbox, scout dispatch.
5. **The Scene**: evening event select + event resolution screens.
6. **Staff Office**: roster, hiring, assignments.
7. **Hall of Legends**: the showroom; collection progress.
8. **End of Day Report**: money in/out, job progress, tomorrow's teasers.

---

## 12. Scope & Milestones

### 12.1 MVP (playable vertical slice)
- 12 car models (1 Legend), 45 parts, Local Yard auction only
- Core loop: buy → inspect → build (slots + condition, no swaps) → sell to 3 buyer archetypes
- 1 hireable staff, service bay, turn-based days, end-of-day report
- Placeholder art on final UI layout; one music loop

### 12.2 v1.0
- ~40 real models incl. 10 Legends + 6–8 Gaisha imports; ~140 parts; engine swaps + dyno tune; equipment-tier progression (lift → dyno → fab corner)
- All 4 auction tiers, 6 buyer types (incl. Gaisha buyer) + Import Broker, market heat + rumor mail, 280 PS Gentlemen’s Agreement system
- 4 staff + traits, all events incl. Wangan Top-Speed Night & Attack Fest, Rival shop, era progression w/ 2004 news event
- Full Hall of Legends, credits, sandbox + New Game+
- Complete art/audio pass

### 12.3 Post-launch candidates
Async leaderboards (fastest Hall completion), weekly seeded challenge auctions, photo mode, kei-car expansion, USDM export market arc.

---

## 13. Tech Stack (LOCKED — v0.4)

**Architecture principle:** the game is 90% UI → DOM-first web app with canvas islands. Sim core is a pure, renderer-agnostic TypeScript package (the SOLID boundary).

| Layer | Tool | Why |
|---|---|---|
| Language | TypeScript (strict) | Non-negotiable for browser games |
| UI framework | **Vue 3** (Composition API) | Team knows it; `computed()` reactivity is ideal for derived car stats |
| State | **Pinia** | Vue's official store; single source of truth the sim writes into |
| Build | **Vite** | Vue-native tooling, static output, instant HMR |
| Canvas islands | **PixiJS v8** | Only for garage scene, animated city map, touge cutaway — mounted inside Vue components |
| Styling | Custom CSS + design tokens | No component library — Vuetify/Material would kill the synthwave pixel identity |
| Persistence | **Dexie.js** over IndexedDB | Versioned schema migrations for save files (Django-migrations energy); autosave on End Day |
| Save backup | Base64 export/import string | User-owned backups, cross-device by hand |
| Content data | JSON tables validated with **Zod** | Cars/parts/buyers/events balanced without code changes; moddable later |
| RNG | Seeded PRNG in sim core | Deterministic days → replayable bugs, future weekly seeded challenges |
| Testing | **Vitest** | Sim core unit-tested like backend code |
| Audio | **Howler.js** | Standard web audio wrapper; music layers + SFX |
| Deploy | Static hosting (itch.io / Cloudflare Pages) | Entire game is static files; zero backend in v1.0 |
| Post-launch backend | Django + Postgres (thin API) | Leaderboards, weekly challenge seeds — only when needed |

**Sim contract:** `advanceDay(state, queuedActions, seed) → newState + eventLog`. The sim package imports nothing from Vue/Pixi/DOM.

**Performance target:** 60fps on a mid-tier laptop; initial download < 25 MB.

---

## 14. Resolved Decisions (v0.3)

1. **Touge interactivity:** purely managerial, hard no-QTE rule (accessibility). Tension via pre-run risk dial + sector-by-sector animated resolution. → §8
2. **Player character:** silent-ish avatar; personality via recurring cast and rare light-touch reply choices. → §2.3
3. **Currency:** era-authentic yen, everywhere. → §6.2
4. **Auction risk:** sliding scale — variance correlates with discount from book value; fair prices are safe, steals are gambles (goldmine or lemon). → §6.5
5. **Navigation:** semi-animated city map as fancy menu. → §11

### Remaining open
1. Save-slot design: single autosave vs. multiple named slots (cheap either way with Dexie).
2. First Pixi island to prototype: garage scene or city map?

---

*"The mountain doesn't care what you paid. Build it right."*
