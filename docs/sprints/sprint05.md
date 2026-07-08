# Sprint 05 — Garage & build-sheet screens

*Source: roadmap Phase 2 (Ugly MVP), Sprint 5. GDD 4.1-4.4 (the car as an object, derived stats,
tags), 5.4 screen list ("Car Detail / Build Sheet: radar chart, slots, condition zones, job queue"),
3.2 (labor slots). Builds directly on Sprint 04's shell + state bridge. Status: **approved
2026-07-08; implementation in progress.***

## Goal

Give the player something to *do* with a car: view it, understand it, and put work into it. The
garage hub lists owned cars; a car-detail screen shows the five-stat radar, per-zone condition, the
build sheet, and a job queue; and the player can queue repairs and part installs against their daily
labor slots, then watch End Day apply that work. This is the first sprint where a decision the player
makes changes the sim — End Day stops being "advance an empty day" and becomes "commit the day's
work."

Crucially, this sprint is **almost entirely game-layer**: the sim already has everything it needs
(`computeDerivedStats`, `createJob`/`completeJob` for both `repair-zone` and `install-part`,
`availableLaborSlots`, and `DayActions.createJobs`/`laborAssignments`, all shipped Sprints 02-03 and
exercised by the bots). No new sim mechanic is required — the work is screens, a radar, and wiring
the existing job pipeline to buttons.

## Definition of Done

- The garage hub lists every owned car (DOM cards, placeholder visuals — the Pixi garage scene is
  Sprint 11) and routes to a car-detail screen.
- Car detail shows: the five-stat radar (Power/Handling/Style/Reliability/Authenticity from
  `computeDerivedStats`), all five condition zones, the build sheet (installed parts per slot), and
  the car's owned jobs with their labor progress.
- The player can queue a **repair-zone** job and an **install-part** job (from a part they own that
  fits the slot), assign labor to jobs within the day's available slots, and End Day applies the
  work — a completed repair lifts the zone to 100, a completed install moves the part onto the build
  sheet and the radar visibly changes.
- Labor over-allocation is prevented in the UI (you can't assign more than `availableLaborSlots`).
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm build` all green; new store +
  component tests pass.

## Decisions (approved 2026-07-08)

1. **Dev-granted cars this sprint; all real acquisition lands in Sprint 06. [APPROVED]** The player
   owns no cars until auctions exist, and no parts until a parts market exists — both are Sprint 06
   (roadmap: "Auction & market screens"). Rather than sprinkle a half parts-economy into this
   sprint, Sprint 05 exercises the garage against content granted through the dev console
   (grant-starter-car, grant-part), and Sprint 06 wires the real buying for cars *and* parts
   together. This keeps the roadmap's garage/market split clean and avoids faking an acquisition
   mechanic. The dev grants are dev-build-only affordances (like `devGiveCash`), never shipped.
2. **The radar is a hand-rolled SVG for now. [APPROVED — "get it done" for the PoC]** User guidance:
   the radar "does not have to look good now — we will worry about art later; whatever is best to
   show proof of concept fast is fine. Always prefer the final tool, but if we don't know the final
   tool yet, just get it done." We don't yet know the final visual approach (art direction locks in
   Sprint 09), so a ~40-line inline SVG pentagon is the fastest honest way to render the five stats
   now — no dependency, no bundle cost, no commitment to a look we haven't chosen. If a charting or
   art approach is picked later, this is a self-contained component to swap.
3. **Radar axis normalization is explicit and tunable.** Four stats are already 0-100; **power** is
   raw PS (unbounded, e.g. 280). The radar normalizes power against a fixed reference ceiling
   (`RADAR_POWER_REFERENCE_PS`, first pass ~500) so the axes are comparable, documented as a display
   tuning constant. It lives in the game layer (a display concern), not sim/content — it doesn't
   change any sim number, only how power maps to a radar spoke.
4. **Car detail is a param route (`/car/:id`).** This is where `vue-router` earns its keep — the
   garage hub links to `{ name: 'car', params: { id } }`, and a missing/sold id redirects back to
   the garage (a simple guard). No new store state for "which car is open."
5. **Part-install compatibility is enforced in the UI.** Only parts whose `slot` matches an empty
   build-sheet slot and whose `requiredTags` are all present on the car's model are offered for
   install. (The sim's `completeJob` already refuses to overwrite an occupied slot; the tag check is
   a UI-side filter this sprint, with a sim-level guard a candidate for later hardening — noted, not
   done.)

## Task breakdown

### A. Garage-layer helpers & selectors (`packages/game/src/stores`, `utils`)

- [ ] Extend `useGameStore` with car/job selectors: `carsWithModel` (owned car + resolved model +
  derived stats), `jobsForCar(id)`, and `availableLaborSlots` (from the sim helper). Keep the store
  the single read/write surface for the sim.
- [ ] Queue-building helpers: `queueRepair(carId, zone, laborSlotsRequired)`, `queueInstall(carId,
  slot, partInstanceId, laborSlotsRequired)`, `assignLabor(jobId, slots)` — each appends to a
  pending `DayActions` the store holds until End Day, so the player composes a day's plan and commits
  it. (Sprint 04's `endDay(actions?)` already accepts a `DayActions`; this fills it in.)
- [ ] `pendingActions` state + a `clearPending`/reset on End Day, so the UI can show "queued today"
  before committing.

### B. Radar chart component (`packages/game/src/components`)

- [ ] `StatRadar.vue`: a pure-SVG five-axis radar taking a `StatBlock`, normalizing per decision 3,
  rendering the pentagon grid + the filled stat polygon in synthwave tokens. No dependency.

### C. Garage hub screen (`packages/game/src/screens`)

- [ ] `GarageScreen.vue` (evolve Sprint 04's): keep the day/cash/rep summary and End Day, add a grid
  of owned-car cards (name via Naming Layer, tier, headline condition, a "to detail" link). Empty
  state points at the dev console (or, post-Sprint 06, the auctions).

### D. Car-detail screen (`packages/game/src/screens`)

- [ ] `CarDetailScreen.vue` at `/car/:id`: header (model name, year, mileage, color, provenance),
  the `StatRadar`, the five condition zones (bars), the build-sheet slot list (installed part or
  "empty"), and the job panel — existing jobs with labor progress, plus controls to queue a
  repair on a zone and install an owned compatible part, and to assign labor within the day's slots.
- [ ] Route guard: unknown/sold `:id` redirects to `garage`.

### E. Dev console additions (`packages/game/src/components`)

- [ ] Extend `DevConsole.vue` (still dev-build-only): grant-starter-car (spawn a seeded `CarInstance`
  of a chosen/random model into `ownedCars`) and grant-part (a chosen catalog `Part` as a
  `PartInstance` into `partInventory`), so the garage is exercisable before Sprint 06's acquisition.

### F. Testing (`packages/game`)

- [ ] Store tests: `queueRepair`/`queueInstall`/`assignLabor` build the expected `DayActions`;
  End Day with a queued repair lifts the zone to 100 after enough labor-days; a queued install moves
  the part to the build sheet and changes derived stats; labor can't exceed available slots.
- [ ] `StatRadar.test.ts`: renders five axes; a higher stat produces a larger polygon (geometry
  sanity), and power normalization maps the reference ceiling to a full spoke.
- [ ] `CarDetailScreen.test.ts` (mounted): a dev-granted car renders its radar + zones + build sheet;
  queuing a repair and ending enough days lifts the zone bar to 100.

## Claude-implementable vs user-only

**Claude-implementable:** everything in A-F (all game-layer; no sim/content changes, no new deps).

**User-only:**
- Run `pnpm dev`, grant a car via the dev console, queue a repair/install, End Day, watch the radar
  move (dev server is user-run).
- No dependency approvals needed — this sprint adds none.

## Open scoping note (surfaced, not decided here)

The GDD workday (3.1) lists "buy parts, order deliveries" as a core loop step, and the roadmap folds
parts into neither Sprint 05 nor 06 explicitly. This sprint's decision 1 routes parts acquisition
into Sprint 06 alongside car auctions; if that sprint gets heavy, a dedicated parts-market slice may
need its own follow-up. Logged in `TODO.md` under balance/economy so it isn't lost. The richer
"order deliveries / lead times / parts scouts" layer is explicitly Sprint 16 (events II), not now.

## Exit

Sprint 05 makes the garage real: you can look at a car, understand its stats, and put labor into it,
with End Day committing the work. Sprint 06 (Auction & market screens) supplies the other half of the
loop — buying cars at auction and parts at market, then selling — at which point the dev-grant
crutch from decision 1 comes out and the buy→build→sell loop closes for the first time (fully wired,
with persistence, in Sprint 07). The Fun Gate (Sprint 08) judges the result.
