# MIDNIGHT GARAGE — Development Roadmap
## Concept → Shipped Game — v1.0
*Companion to the Game Design Document v0.4. This document is written to be self-contained and executable: every sprint has a deliverable and a definition of done, every risk has a mitigation, every gate has a kill/pivot criterion.*

---

## 0. Ground Truth & Assumptions

State these honestly now so the plan doesn't lie to you later:

- **Team:** solo developer. Strong: Vue 3 full-stack (Django/SaaS), Godot game dev, Python/SQL. New: PixiJS, pixel art at production quality, browser game shipping.
- **Time budget assumption:** ~10 focused hrs/week (part-time passion project). Every estimate below scales linearly if this changes.
- **Sprint length:** 2 weeks. **Total plan: ~27 sprints ≈ 13 months to v1.0 launch.** This is the honest number. Solo games that "should take 6 months" take 13. Plan for 13 and be delighted.
- **Budget assumption:** small but real (¥ for art/music commissions, ~$1,500–4,000 USD total). A $0 budget is possible but moves art fully onto your plate (see Risk R1).
- **Engineering principles:** SOLID/DRY apply squarely — the sim core is the dependency-inversion boundary (pure TS, zero framework imports); content lives in data, not code (DRY at the design level); every system is testable headless.
- **Python stays in the toolchain** even though the game is TypeScript: the balancing/analysis harness (§5.3) is pandas over headless-sim CSV output. Your strongest skill becomes the game's tuning instrument.

**The one-sentence strategy:** build the boring, testable simulation first; prove it's fun with ugly art; only then spend the art/audio budget; ship on itch.io free; let reception decide the Steam/monetization question.

---

## 1. Big-Picture Phase Map

| Phase | Sprints | Output | Gate at the end |
|---|---|---|---|
| **P0 — Foundations** | 0 | Repo, CI, pipelines, economy spreadsheet | Tooling proven end-to-end |
| **P1 — Sim Core** | 1–3 | Headless game that plays itself | Balance harness produces sane 100-day runs |
| **P2 — Ugly MVP** | 4–8 | Buy→build→sell loop, placeholder art, saves | **FUN GATE:** 5 strangers play 30+ min voluntarily |
| **P3 — The Vibe Slice** | 9–12 | Final art style on 6 cars, map, music, juice | **VIBE GATE:** screenshots resonate publicly |
| **P4 — Systems Complete** | 13–18 | Staff, events, rep, commissions, rival, 280PS | Feature-complete on GDD systems |
| **P5 — Content Production** | 19–23 | Full roster (40 cars, 140 parts), Legends, endgame | Content-complete, campaign finishable |
| **P6 — Beta & Polish** | 24–26 | Closed beta, tutorial, accessibility, perf | Beta retention + crash-free saves |
| **LAUNCH** | 27 | itch.io release | — |
| **P7 — Post-launch** | ongoing | Patches → leaderboards (Django) → Steam eval | Reception-driven |

Rule that governs everything: **no art or audio money is spent before the Fun Gate passes.** Systems are cheap to change; sprites are not.

---

## 2. Risk Register — Showstoppers First

Ordered by (probability × impact). Read R1–R4 twice.

### R1 — Art volume is the project-killer (SEVERE)
40 car models × visible parts (wheels, aero, ride height) × paint colors is a combinatorial bomb. A naive "one sprite per configuration" approach is **thousands of sprites** and kills the project.
**Mitigation (architectural, decide in P0):**
- **Layered compositing:** each car = base body sprite + wheel layer + aero overlay layers + a ride-height y-offset. Parts are drawn once *per body family*, not per configuration.
- **Palette-swap for color:** bodies drawn in an indexed 4-tone template palette; paint colors are runtime palette swaps (trivial in Pixi via color-replace filter or pre-baked LUTs). One drawing = every color.
- **Shared wheel library:** wheels drawn once at 2–3 sizes, reused across all cars.
- Realistic art bill: ~40 body sprites + ~20 wheels + ~30 aero overlays + scenes ≈ **a commissionable package**, not an impossible one.
- **Budget path:** commission a pixel artist for body sprites (the highest-skill asset), DIY UI/icons/scenes yourself in Aseprite (learnable at your art-adjacent skill floor; UI pixel art is far more forgiving than car sprites).
**Kill criterion:** if by end of P3 you cannot produce/commission 6 final-quality cars, cut the roster to 20 and redesign rarity density — do not silently let the game become 3 years long.

### R2 — Safari can delete your players' saves (SEVERE, obscure)
WebKit's Intelligent Tracking Prevention can evict script-writable storage — **including IndexedDB — after ~7 days of Safari use without visiting your site.** A returning iPhone player can find their 40-hour save gone. This is the #1 unknown-unknown of browser games.
**Mitigation (layered):**
- Call `navigator.storage.persist()` on first save (honored on Chromium/Firefox; request it everywhere).
- **Export-save-string culture:** prominent one-tap "Copy save code" + auto-reminder every N in-game weeks; treat it as diegetic ("garage insurance papers").
- Optional post-launch: tiny Django endpoint for cloud-save-by-code (no accounts, just a claim code) — cheap insurance, your home turf.
- Document the risk on the itch page for iOS players.

### R3 — Solo-dev scope creep & burnout (HIGH)
The GDD is already ambitious. Every JDM rabbit hole ("we NEED kanjo Civics… and dori parks… and an Osaka expansion") is a month.
**Mitigation:** the GDD v0.4 feature set is **frozen** for v1.0. New ideas go to `IDEAS.md`, cost-estimated, and scheduled post-launch only. Sprint plan has explicit *slack sprints* (13, 23). One "small win" per sprint (something visible/shippable) to protect motivation. Public devlog cadence (§7) creates external accountability.

### R4 — The economy might not be fun (HIGH)
Management sims live or die on the money curve. Too easy = idle mush; too tight = spreadsheet misery. You cannot feel this from code review.
**Mitigation:** economy is designed **spreadsheet-first** (P0), then validated by the **headless balance harness** (P1): run 1,000 simulated 100-day careers across bot strategies (pure flipper / service grinder / event chaser), dump parquet, analyze with polars via a CI-run CLI report. Assert invariants: "a competent flipper reaches Act 2 by day 25±10", "rent pressure is real until first staff hire", "no strategy 3× dominates". Re-run on every balance change (it's a test suite).

### R5 — Licensing (MEDIUM likelihood, HIGH impact, fully pre-mitigated)
Real names + free web game = low practical risk; any monetization changes the calculus (GDD §2.4).
**Mitigation:** the Naming Layer is **built and CI-tested from Sprint 1** — a single flag flips the entire game to parody names, and a test asserts no real-brand string leaks when flagged. A C&D becomes a config change + redeploy, not a crisis. Also: trademark-search the game title itself in P0 (titles are the *most* enforced mark).

### R6 — Mobile browser reality (MEDIUM)
iOS Safari: audio requires a user gesture to start (Howler handles unlock, but design the title screen as the gesture), 300ms quirks, viewport/safe-area pain, memory limits on texture atlases.
**Mitigation:** test on a real iPhone from P2 onward (not just responsive mode). Desktop-first per GDD, but the auction and end-day screens should be genuinely phone-usable — that's where "one more day" sessions happen.

### R7 — Save-schema migrations break saves (MEDIUM)
Every content patch after beta risks corrupting existing saves.
**Mitigation:** Dexie versioned schemas from the first save ever written; a **golden-saves test suite** (real save files from each released version, CI asserts they migrate and load); never rename fields, only add + migrate.

### R8 — Music licensing trap (LOW, cheap to avoid)
Real eurobeat (or anything Initial D-adjacent) is licensed music. Do not touch it, including "tribute" covers.
**Mitigation:** commission 3–5 original synthwave/eurobeat-*style* tracks (fiverr/soundcloud producers, $50–200/track, buy exclusive or broad license in writing) or curate CC-BY tracks with attribution screen. Same rule for fonts (use OFL fonts) and SFX (freesound CC0 + your own foley).

### R9 — The tutorial is designed last and shows it (MEDIUM)
Management sims routinely lose 60% of players in 10 minutes to onboarding.
**Mitigation:** onboarding is a *designed feature* with its own sprint (25). Structure already exists diegetically: Act 1's oil-change jobs ARE the tutorial; the landlord character is the tutor. Design principle: teach one system per in-game day for the first 7 days.

---

## 3. Sprint-by-Sprint Plan

Every sprint lists **Deliverable** and **Definition of Done (DoD)**. If a sprint slips, the *next* sprint shrinks — the gates never move silently.

### PHASE 0 — Foundations

**Sprint 0 — Tooling proves itself end-to-end**
- Repo (GitHub), Vite + Vue 3 + TS strict scaffold, ESLint/Prettier, Vitest wired.
- CI (GitHub Actions): typecheck, lint, test, build, auto-deploy `main` to Cloudflare Pages preview URL.
- Monorepo layout: `packages/sim` (pure TS), `packages/game` (Vue app), `packages/content` (JSON + Zod schemas), `tools/balance` (Python: polars, CLI).
- Aseprite bought; draw one deliberately-bad car sprite; composite body+wheels+palette-swap in a Pixi sandbox → **proves the R1 art architecture before any real art exists.**
- Economy spreadsheet v0: price curves by tier, rent/wage pressure, labor-slot costs, act pacing targets.
- Trademark search on final title; register domain; private `IDEAS.md` created.
- **DoD:** a placeholder car renders in 4 palette-swapped colors on a deployed URL, from CI, with one passing sim test.

### PHASE 1 — Sim Core (headless game)

**Sprint 1 — Data model & schemas**
- Zod schemas: `CarModel`, `CarInstance` (condition zones, hidden issues, authenticity, provenance), `Part` (slot, grade, tags, condition), `Buyer`, `Staff`, `GameState`, `DayLog`.
- Naming Layer implemented (`display_name` indirection + CI leak test) — per R5, from day one.
- Seed content: 8 real cars spanning tiers ('84 City AA → JZA80), 20 parts.
- **DoD:** `pnpm test` validates all content against schemas; naming-flag test green.

**Sprint 2 — The day tick**
- `advanceDay(state, actions, seed)`: labor-slot allocation, job progress, part install/condition math, derived stats (Power/Handling/Style/Reliability/Authenticity), service-bay income, weekly rent/wages, market heat drift.
- Deterministic seeded PRNG; golden-master test ("seed 42, 30 scripted days → exact state hash").
- **DoD:** a scripted 30-day career runs headless and reproducibly.

**Sprint 3 — Markets, auctions & the balance harness**
- Auction generation (tiered catalogs, hidden-issue variance scaling with discount — the sliding-scale lemon rule), bidding resolution vs AI bidders, buyer-archetype valuation functions, sell channels.
- **Balance harness:** 3 bot strategies play 1,000 careers → sim emits **parquet** → `tools/balance` CLI (Python + **polars**) computes distributions, renders a markdown/HTML balance report as a CI artifact, and enforces the invariant assertions from R4. Balance review = reading the report on the PR.
- First real tuning pass against the spreadsheet targets.
- **DoD:** invariants pass; you can answer "what does day 40 look like for a flipper?" with a chart.

### PHASE 2 — Ugly MVP (find the fun)

**Sprint 4 — Vue shell & state bridge**
- Pinia store wrapping sim state; screen router; design tokens (synthwave palette, OFL pixel font); dev console (give money, warp days).
- **DoD:** end-day button advances the real sim in the browser.

**Sprint 5 — Garage & build sheet screens**
- Garage hub (DOM, placeholder art), car detail with radar chart, part install flow, job queue with labor slots.
- **Sprint 6 — Auction & market screens:** catalog, inspection, live bid escalation, mail/rumors, sell flow with buyer offers.
- **Sprint 7 — Persistence & the first full loop:** Dexie autosave on End Day + versioned schema + export/import string (R2 mitigations in from the start). End-of-day report screen. Loop closes: buy→inspect→build→sell→rent pressure.
- **Sprint 8 — FUN GATE prep & test:** bug-fix, minimal onboarding text, deploy behind a link. Recruit 5–8 strangers (r/tycoon, r/incremental_games, JDM Discords), watch 3 play live (screenshare), survey all.
- **GATE CRITERIA:** median voluntary session ≥ 30 min; ≥ half say some version of "one more day"; testers can articulate the fantasy back at you. **If failed:** do not proceed to art. Diagnose with the harness + interviews, iterate P2 up to 2 more sprints. If still failing, the concept pivots (deepen auction gambling? tighten labor scarcity?) — this gate exists to spend weeks, not months, being wrong.

### PHASE 3 — The Vibe Slice (spend money now)

**Sprint 9 — Art direction lock**
- Commission test: 2 artists × 1 car sprite in the layered template spec; pick one; write the asset spec doc (canvas sizes, palette indices, layer naming) — this doc is what makes commissions DRY.
- You: UI skin pass #1 (fax mail, teletext market, catalog pages), title screen.
- **Sprint 10 — First six cars, final quality** (City, EG6, AE86, S14, FD3S, JZA80 — one per tier). Wheels library v1. Palette-swap LUT pipeline productionized.
- **Sprint 11 — Pixi islands:** garage scene (cars visibly change with builds — ride height, wheels, aero) + semi-animated city map navigation.
- **Sprint 12 — Sound & juice:** Howler layers (day/night loops, 1 commissioned event track), SFX pass (ratchet, shutter, END-DAY kachunk), screen transitions, dyno-pull animation with the 280PS needle-sweep easter egg moment.
- **VIBE GATE:** post 2 GIFs + 4 screenshots publicly (Twitter/X, r/JDM, r/pixelart, itch devlog). Criteria: genuine unprompted "I want to play this" replies. This validates the marketing asset — for a vibe-led game, shareability *is* a feature. Failure = art direction iteration, not project death.

### PHASE 4 — Systems Complete

- **Sprint 13 — SLACK + staff system** (hire, stats, traits, assignment; service-bay delegation arc). **Includes the skill/XP progression system** — learn-by-doing growth for staff *and* the player character, where skill *optimizes* (efficiency/quality) but never *unlocks* tiers (tools + rep still do that). Player-character skill may debut earlier alongside the service-jobs feature. Full design: `docs/design/skill-progression.md`.
- **Sprint 14 — Commissions & rep tiers** (briefs, scoring, act gating, equipment purchases as unlocks).
- **Sprint 15 — Events I:** night meet, show & shine (incl. Gentleman's Class), magazine features → market heat spikes.
- **Sprint 16 — Events II:** touge nights (pace dial, sector-by-sector cutaway resolution, damage), part scouts.
- **Sprint 17 — Rival shop AI** (auction bidding personality, event presence, offers) + private meetings + engine swaps & dyno tune screen.
- **Sprint 18 — Era progression & 280PS system complete** (spec-sheet masking, 2004 news event, achievements). Debt/repossession pressure. **DoD:** every GDD §3–§8 system exists and is harness-tested.

### PHASE 5 — Content Production (assembly-line sprints)

- **Sprint 19–20 — Roster wave 1+2:** to 25 cars, ~100 parts; commission pipeline running in parallel (art spec doc pays off here). Balance harness re-run per wave.
- **Sprint 21 — Gaisha:** import broker, 6–8 imports, gaisha buyer, parts-scarcity rules.
- **Sprint 22 — The Legends:** all 10, acquisition leads/story beats, enshrinement rules, Hall of Legends scene, credits, sandbox + NG+.
- **Sprint 23 — SLACK + Wangan Top-Speed Night & Attack Fest** (Act 4 events), full roster to 40. **DoD:** campaign completable start→credits by a bot and by you.

### PHASE 6 — Beta & Polish

- **Sprint 24 — Closed beta:** 30–50 players (waitlist from devlogs), opt-in anonymous telemetry (day reached, money curve, drop-off screen — a few fetch beacons, not a platform), bug triage. Golden-saves migration suite starts here (R7).
- **Sprint 25 — Onboarding & accessibility:** designed Act-1 tutorial via landlord character (R9); colorblind-safe palette check, reduced-motion toggle, font scaling, full keyboard nav, CRT filter default-off.
- **Sprint 26 — Performance & release hardening:** texture atlases, code-splitting, <25MB budget audit, real-device iOS/Android pass (R6), save-persistence prompts (R2), balance final pass from telemetry.

### LAUNCH — Sprint 27
Checklist: itch.io page (GIF-first), press kit, save-code FAQ, known-issues doc, launch devlog, posts to the communities that beta'd it, day-1 hotfix window held open, analytics dashboard watched for save failures above all.

### PHASE 7 — Post-launch (reception-driven, in order)
1. Patch cadence (weeks 1–4): bugs, balance, QoL from reviews.
2. **Django + Postgres thin API:** cloud-save claim codes (R2 forever-fix), then weekly seeded challenge auctions + async leaderboards (the seeded PRNG finally cashes in).
3. **Steam evaluation:** only if itch reception earns it — wrap with Tauri (lighter than Electron), *flip the Naming Layer for the paid build*, wishlist campaign, Steam Next Fest demo.
4. Content packs from `IDEAS.md` (kanjo pack, kei expansion, USDM export arc).

---

## 4. Content Production Pipeline (the assembly line)

Applies from P5; design it in P3.
1. **Car spec sheet** (you, 20 min/car): real specs, tier, tags, base prices, hidden-issue table, sprite brief.
2. **Sprite commission** (artist, batched 5/order against the asset spec doc) → PR with layered files.
3. **JSON entry** in `packages/content` → Zod validates in CI; naming-layer entry required or CI fails.
4. **Harness smoke:** new car auto-included in bot runs; price-sanity assertions.
5. **In-game review checklist:** renders in all colors, wheels/aero composite, sells to correct archetypes.
Throughput target: 5 cars/sprint alongside feature work. Parts and buyers follow the same 5-step shape (DRY applies to process, not just code).

---

## 5. Engineering Standards (held for 13 months)

- **Boundary law:** `packages/sim` never imports Vue/Pixi/DOM/Dexie. Enforced by ESLint import rules, not discipline.
- **Content law:** if it's a number a designer would tune, it lives in JSON, not code.
- **Test law:** every sim bug fixed gets a regression test; golden-master seeds run in CI; balance invariants run on content changes.
- **Save law:** schema changes require a Dexie version bump + migration + golden-save test, in the same PR.
- **The Python seam:** headless sim runs export **parquet**; `tools/balance` is a **polars-based CLI** producing a versioned balance report (CI artifact) + hard assertions that fail the build. SQL optional: point DuckDB at the parquet for ad-hoc queries. No notebooks in the pipeline.
- **Weekly ritual (30 min):** update devlog, groom next sprint, back up Aseprite sources + commissioned assets off-site (asset loss is unrecoverable in a way code loss isn't).

## 6. Official Documentation Index (canonical references)
Vue 3: vuejs.org/guide • Pinia: pinia.vuejs.org • Vite: vitejs.dev/guide • Vitest: vitest.dev • PixiJS v8: pixijs.com/8.x/guides • Dexie (versioning/migrations): dexie.org/docs/Tutorial/Design#database-versioning • Zod: zod.dev • Howler: github.com/goldfire/howler.js • Storage persistence & eviction: developer.mozilla.org/en-US/docs/Web/API/Storage_API • WebKit ITP storage policy: webkit.org/blog (Full Third-Party Cookie Blocking and More) • Aseprite: aseprite.org/docs • itch.io creator docs: itch.io/docs/creators • Tauri: tauri.app • Steamworks: partner.steamgames.com/doc • GitHub Actions: docs.github.com/actions • Cloudflare Pages: developers.cloudflare.com/pages

## 7. Marketing & Community (runs parallel, ~1 hr/week)
- **Devlog from Sprint 9** (once there's vibe to show): itch devlog + one social channel; GIFs > words; the dyno needle-sweep and garage scene are your money shots.
- Beta waitlist form linked from every post (feeds Sprint 24).
- Honest positioning: "Fiz meets Gran Turismo 2's used-car lot, in a synthwave 1995."
- Do not open a Discord before beta; a dead server is anti-marketing.

## 8. Launch Definition of Done
Campaign completable • all 10 Legends enshrined by at least one beta player • crash-free save/load across 3 released schema versions • <25MB initial load • 60fps garage scene on a 2019 laptop • iOS Safari playable with save-export flow verified • tutorial completion >70% in beta telemetry • naming-layer flip verified in CI • credits, licenses & attribution screen complete.

---

*Ship the ugly version to strangers early. The mountain doesn't care what you paid — and the internet doesn't care what you planned. Build it right.*
