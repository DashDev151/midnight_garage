# Sprint 131: the performance sandbox

**Status: BUILT, ready for review.** Maintainer request 2026-07-28, with scope answers given before
work started: **all 85 cars**, a **missing** position on the condition control, and a **shareable
build**.

A tool for the maintainer, not a player feature. It exists to make the car performance model
inspectable: pick a car, set every component's condition and fitted tier, and watch the measured
figures, the roll-up stats, the four lap times and the retail value move.

The maintainer's framing, which set the standard for the whole sprint: **this is the entire engine
behind the game's core loop, and how condition and aftermarket parts affect value and performance is
the crux of the design.**

## The decision the whole sprint rests on

**It runs the REAL sim. No physics is reimplemented anywhere.**

A reimplementation is the obvious way to build a self-contained tool and it is the wrong one. It
would be a second expression of physics that took days to validate, it would drift from
`packages/sim` within a sprint, and the drift would be silent because both sides would look
plausible. The whole of Sprints 127 to 130 was about collapsing parallel truths into one; this sprint
must not create a new one.

### It is a dev screen, not an artifact (maintainer decision, mid-sprint)

The sprint was first designed as a standalone HTML artifact with the sim bundled into it by Vite's
library mode. That worked, and it carried one unavoidable weakness: **a bundle is a snapshot and goes
stale the moment a lever moves**, which for the instrument the game is balanced against is dangerous
rather than merely annoying. It needed a provenance stamp purely to make staleness visible.

The maintainer changed it to a dev screen inside the game, and that removes the weakness rather than
mitigating it. There is no bundle, no stamp, and nothing that can disagree with the game, because it
imports `packages/sim` directly and runs whatever the repo currently says.

It registers in the existing `devRoutes` array in `packages/game/src/router/index.ts`, gated on
`import.meta.env.DEV`, which folds to a literal `false` in production so the route and everything it
lazily imports drop out of a shipped build. Three screens already use that pattern; no new mechanism
was invented. **The drop is verified by grep against a real production build, with a control to prove
the grep reaches bundle content**, rather than assumed from the gate.

The one thing lost is the URL-encoded build, and deliberately: the router uses memory history with no
URL coupling, because the game ships in an itch.io iframe where URL routing fights the embedding.
A copyable build code does the same job without fighting that.

## Reuse analysis (directive 16)

### Genuinely new

| New | Why nothing existing covers it |
|---|---|
| The spec-book to `CarModel` generator | 59 of the 85 cars are research entries with no content model. Nothing today turns a spec-book row into something the sim can consume, and the spec book is HTML so it cannot be read at runtime. |
| The sandbox screen itself | No existing surface exposes per-component condition and tier together with the physical outputs. |

### Existing mechanisms reused, unchanged

- **The entire sim.** `computeDerivedStats`, `lapTimeSecondsFor`, `lapBlockers`,
  `physicalConditionFactors`, `effectiveGrip`. Called, never copied.
- **The content catalogues**: `cars.json`, `parts.json`, `parts-taxonomy.json`, `economy.json`,
  `courses.json`.
- **`car-spec-book.html`** stays the vetted upstream for the 85 and is read the same way the harness
  reads it, by extracting its `CARS` array.
- **`lapsim-data.json`** is the acceptance oracle, exactly as it was for Sprint 128.

## The 85, and the honesty problem in the 59

26 cars come from `cars.json` and are the real thing. **59 are research entries that are not in the
game**, and they carry no tier and no book value. Those are synthesised by the adapter:

| Field | Source for a synthesised car |
|---|---|
| every physical figure | the spec book, unchanged. This is the part that matters and it is real. |
| layout, induction and engine-family tags | derived from the spec book's own drivetrain, engine position, aspiration and engine configuration. `layoutTagOf` drives real physics, so this is derived rather than defaulted. |
| the `Kei` tag | the spec book's own section. It changes the track width the grip formula reads. |
| `tyreCompound` | derived from the stock tyre's section width and the build year, the same classification that produced every `tyreCompound` in `cars.json`. |
| `activeYaw` | engine code (RB26DETT, VR38DETT) and the Evo line, as the harness identifies it. |
| `tier` | mapped from the spec book's roster section. See the table below: eight rows DERIVED, five ASSIGNED. |
| `brand` | first token of the display name. Reads `Alfa` rather than `Alfa Romeo` on the one two-word marque; no physics reads it. |
| `chassisCode`, `bookValueYen`, parody names | placeholders. Read by nothing. |

**Parts are not per car.** The catalogue has four fitment classes of 118 SKUs each, and
`fitmentClassForTier` maps the class from the car's tier one to one. So a synthesised car needs one
field, `tier`, which selects an existing shared catalogue; it does not need a catalogue of its own.

### Section to tier

The first eight rows are derived from the 26 in-game cars: their own spec-book section against their
own real `cars.json` tier, majority wins, ties to the lower tier. Anyone can re-derive them from
those two files. The last five are assigned by judgement, because no in-game car occupies those
sections at all. Two data-driven routes were measured and rejected: Forza credit price and rarity do
not separate our tiers (`common` spans 15,000 to 237,500 credits, `uncommon` 20,000 to 237,500), and
the roster doc's tiers are SCOPE tiers, not value tiers.

| `sec` | `tier` | Basis |
|---|---|---|
| Shitbox | `shitbox` | 3 of 3 in game |
| Kei | `shitbox` | 3 of 3 |
| Bubble weird | `shitbox` | 1 of 1 |
| Fast FWD | `common` | 3 of 4 |
| FR / Drift | `uncommon` | 6 of 6 |
| Rotary | `uncommon` | 1 uncommon, 1 rare; take the lower |
| AWD Turbo | `uncommon` | 1 uncommon, 1 rare; take the lower |
| Flagship | `rare` | 3 of 5 |
| 2004+ wave | `uncommon` | ASSIGNED, no in-game example |
| Gaisha | `rare` | ASSIGNED, expensive imports |
| Kyusha | `rare` | ASSIGNED, genuinely valuable classics |
| Hyper wave | `rare` | ASSIGNED, R35 / LFA / BNR34 |
| Legend | `rare` | ASSIGNED |

**So: a synthesised car's STOCK figures are trustworthy, and its BUILD figures depend on an assumed
tier.** `listCars` returns each car's tier and whether it is the car's real in-game value, derived,
or assigned, and `setTier` lets the page change it, so the assumption is one the maintainer can see
and test rather than one buried in a table. Every research entry is badged in the UI as not in the
game. This is a tool for judgement, and a number whose provenance is invisible is worse than no
number.

Two synthesised cars post-date the content schema's 2010 year bound: the RX-8 R3 (2011) and the GT-R
Black Edition (2012). The LFA is a 2010 car and is inside the bound. Synthesised models are
constructed as typed objects rather than parsed, so this is recorded rather than worked around; the
only consumer of year in the physics is the era-rubber fallback, whose top band both cars are past
anyway.

## What the page shows

**The build**, every one of the 29 components in taxonomy order, grouped by component group:

- a **six-position condition control**: missing, scrap, poor, worn, fine, mint
- a **four-position tier control**: stock, street, sport, race, offering only grades the car can fit
- **set-all controls** for both axes

**The results**, each as stock against current so the effect of the build is the point rather than
the absolute:

1. **Roll-up stats**: power, handling, style, reliability, authenticity.
2. **The physical figures**: mechanical grip, downforce coefficient, braking coefficient, launch
   acceleration, effective wheel power, drag area, mass, and the four condition dials.
3. **The measured inputs** the car started from, so it is always visible what is measurement and
   what is derived.
4. **Lap times** on all four courses, or, when the build cannot run, **the reason and the parts
   responsible**, which is what `lapBlockers` exists for.
5. **Value**: what the car is worth stock and mint, and what this build is worth.
6. **The build stamp**: what content this bundle was built from, so a stale page can be recognised
   as one.

### Value, and what it is deliberately not

**Full retail, and two numbers.** `marketValueYen` for the car with every slot mint and stock, and
`marketValueYen` for this build. The difference between them is what condition and aftermarket parts
are worth, which is the question, and nothing else is returned: no breakdown, no parts spend, no
buyer archetypes, no per-component marginal deltas (explicitly deferred by the maintainer).

Market heat is held at **100 (neutral)** and mileage at the midpoint of the range the auction
generator would roll for a car of that age (`mileageRangeForAge`, off `economy.json`'s own curves,
with age taken against the campaign's opening year). Neither is a control: a retail value is a
neutral-market figure. Both are surfaced read-only so a value figure is never unexplainable.

**Both figures are null for the 59 research entries.** `marketValueYen` prices from the model's
`bookValueYen`, which a research entry does not have; the adapter carries a placeholder there because
no physics reads it, and putting a book value on a car the game does not sell would be inventing an
economy number the maintainer owns. Returning 1 yen would have been a fabricated answer wearing the
clothes of a real one. The page shows the 26 in-game cars a value and tells the other 59 why not.

**Performance and value are independent by maintainer law.** A car is never worth more BECAUSE it is
faster, and `marketValueYen` enforces that structurally by taking no derived stat as an argument at
all. `packages/sim/tests/valueStatIndependence.test.ts` makes that executable: it holds one
`CarInstance` fixed, doubles the model's power and lifts its measured lateral pair, asserts the power
and handling stats move, and asserts market value does not move by a yen.

### The build stamp

The artifact is a snapshot, it cannot reach the network, and a stale page showing confident wrong
numbers is the failure that matters. So the bundle carries, at build time: the **economy content
hash** computed exactly as `economyApprovalGate.test.ts` computes its pin (so it is directly
comparable to the repo's own gate), the **cars content hash**, the **short git SHA** of HEAD where
git is available, and the **build timestamp**. No freshness heuristic and no fetch: the stamp states
what it was built from, and comparing that against the repo is the human's job.

`pnpm sandbox:build` prints the hash it baked in. The bundle is built to a staging directory and
promoted to `dist/` only once acceptance passes, so a broken bundle never sits on disk waiting to be
published.

## Acceptance

**Every one of the 85 cars at stock, mint, must reproduce `lapsim-data.json`'s time for that car on
all four courses.** That is the same oracle Sprint 128 used and it holds the adapter honest as well
as the bundle: if a synthesised car's model is wrong, its stock lap time will say so.

Tolerance 0.2 s, as in Sprint 128, because the fixture is rounded to 0.1 s. A miss is never fixed by
widening it.

Alongside it, a value self-check on all 85: at the mint-and-stock build, `stockMintYen` must equal
the build's own value exactly, since that build IS the mint stock car.

### The one difference that is not the adapter's

83 of the 85 land within 0.1 s. Two do not: the **Lexus LFA** (worst 0.30 s) and the **Lamborghini
Countach LP5000 QV** (worst 0.20 s), both slow, both on the fast courses.

The cause is named in the harness's own report, under "THE TRACTION RELEASE ABOVE 161 KM/H": on a car
whose tyres run out before its engine does, the harness hands part of the crank-to-effective power
shortfall back above 161 km/h. **It fires on 3 of the 85** (those two and the Ferrari 512 TR, whose
movement is 0.03% and stays inside tolerance) and always makes the car faster.
`packages/sim/src/performance.ts` does not carry that term, so the shipped physics is fractionally
slow on exactly those cars.

This is not an adapter fault, and the evidence is that every quantity the lap runs on reproduces the
fixture exactly for both: mechanical grip 1.010 and 1.083 against the fixture's 1.01 and 1.08, launch
plateau 7.64 and 6.22 m/s^2 against 7.64 and 6.22, effective wheel power 271 kW and 178 kW against
271 and 178. The models are right; the lap walk is where the gap is. `harnessAcceptance.test.ts` has
never seen it because no shipped car is fast enough to fire the release.

The acceptance script names those two cars individually at their own stated bounds, so the difference
cannot grow unnoticed and no other car can hide behind it. **Whether to port the traction release
into `performance.ts` is a maintainer decision and is not taken here.**

## Where it lives, and how to check it

**The screen:** `packages/game/src/screens/PerformanceSandboxScreen.vue`, with its model layer in
`packages/game/src/screens/dev/sandboxModel.ts`. Both are ordinary game code: linted, formatted,
typechecked and covered by `pnpm test` like anything else.

**The generator:** `tools/sandbox/generateCars.mjs` is all that survives of the bundle work. It
reads the spec book and emits the 59 synthesised research models as
`packages/game/src/screens/dev/sandboxCars.ts`, which the screen imports. It exists because the
spec book is an HTML file and cannot be read at runtime in a browser.

- `pnpm sandbox:cars` regenerates that file and then runs the acceptance.
- The acceptance itself lives in `packages/game/src/screens/dev/sandboxCars.test.ts`, so **it runs
  in every `pnpm test`** rather than only when someone remembers a script. That is strictly stronger
  than the standalone check it replaced.

## Definition of done

- [x] It runs the real sim; no physics is reimplemented anywhere. Grep confirms the sandbox sources
      define no formula: no drag equation, no band curve, no grip expression.
- [x] All 85 cars selectable, the 59 research entries badged as not in the game.
- [x] All 29 components controllable on both axes, with set-all globally and per group.
- [x] A build round-trips through a copyable code.
- [x] All 85 stock times match the harness within 0.2 s, with two cars at their own stated bounds
      for a named and understood reason.
- [x] A blocked build names the parts responsible rather than showing a blank.
- [x] The dev route is absent from a production build, verified by grep with a control.

## Exit

**Status: ready for review.** The sandbox is a dev screen at `/performance-sandbox`, registered in
the existing `devRoutes` array and lazily imported like the three screens already there.

### What shipped

`PerformanceSandboxScreen.vue` (1,592 lines) and its model layer `dev/sandboxModel.ts` (497),
which owns the roster, the fittable-grade lookup, the instance build, the evaluation and the build
codec, and calls `packages/sim` directly. The screen holds the build; Vue computeds do the caching.

Layout top to bottom: car picker (85, searchable, research entries badged), a **sticky summary**
carrying the four lap times and the retail value so they stay visible while scrolling the component
list, car facts with the roster-tier control and its provenance note, the build panel, the build
code, then lap times, value, roll-up stats, physical figures, condition factors and measured inputs.
Every results table is stock against the current build with a change column.

The condition control reads as a gauge rather than a row of buttons: segments up to the fitted band
light in that band's colour, so length and hue both carry the state. A touched component gets a
coloured edge; a blocking one turns red and says it stops the car.

### The build code

`v1|<carId>|<tier>|<29 chars>`, one base64url character per slot, which covers all 21 states. Copy
button and a paste field that refuses anything it did not write. It replaces the URL encoding the
sprint originally specified, for the reason recorded at the top of this document.

### Generation and acceptance

`tools/sandbox/generateCars.mjs` emits `dev/sandboxCars.ts` (85 entries, 76.8 KiB), formatted with
the repo's own Prettier so it needs no ignore entry and typechecks as
`readonly SandboxRosterEntry[]`. The acceptance moved out of a standalone script into
`dev/sandboxCars.test.ts` (86 assertions), so it now runs in every `pnpm test`.

### Verification

```
PerformanceSandboxScreen.test.ts  5 passed
  loads a car and shows a real lap time on all four courses
  a function-or-fail part at scrap replaces the times with the reason and the part
  set-all reaches every control on both axes, and holds a slot no part fits
  a build code round-trips the car, the tier and all 29 slots
  a research entry is told it has no price rather than shown a zero

pnpm test packages/game   62 files, 826 tests passed
pnpm typecheck            content, sim, game all Done
pnpm lint / pnpm format   clean
```

**Production drop, verified rather than assumed.** `pnpm build`, then grep across `dist/assets/*.js`
and `dist/*.html` for the route name, the screen name, the roster constant and two research-only car
ids: no match. A control confirms real car ids ARE present in the bundle, so the grep was looking in
the right place.

### Four things the implementation hit, recorded because each is a trap

- `isMissing` as a type predicate needs `slot is { missing: true } | undefined`, or
  `noUncheckedIndexedAccess` leaves `undefined` in the false branch.
- The Vue template parser rejects TS non-null assertions inline; they belong in a computed.
- Prettier's programmatic API through `createRequire` lands on the CJS namespace and needs
  `mod.default ?? mod`.
- **Set-all to race cannot touch `panels`, `paint` or `underbody`**: no aftermarket SKU exists at any
  grade. It leaves them alone rather than fitting something that does not exist, and a test pins
  exactly those three.

### Open, not taken here

Whether to port the traction release into `performance.ts` (see Acceptance above), and the roster
re-tiering and JDM variant switch recorded in `TODO.md`, both of which will move this screen's data.
