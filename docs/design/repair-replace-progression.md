# Repair vs. Replace — the equipment progression spine (design, not scheduled)

*Systems design written 2026-07-09 at the maintainer's direction. Supersedes and absorbs the
"equipment-gated repair specialization" TODO note. No code exists for this yet — this doc is the
source of truth when its sprint(s) start. Companion docs: `facilities-bays.md` (bays = capacity),
`skill-progression.md` (skill = efficiency). This doc is **equipment = capability**. Together they
are the three physical pillars of "Tools, not levels" (GDD §258).*

## The core loop (maintainer's design)

Every part category has two paths to "this car's brakes/suspension/engine work again":

- **REPLACE** — buy a part at the market, install it. Costs **part price + labor**. Available from
  day one for everything: no special equipment needed to bolt on a new part.
- **REPAIR** — restore the existing stock part to 100%. Costs **labor only** (± small consumables) —
  but requires **owning that category's repair equipment**, which you must buy first.

The interplay over a career:

1. **Early game — forced replacement.** You own no repair equipment. A car with shot brakes means
   buying brake parts. Every fix bleeds money to the parts market; margins are thin; the parts cost
   is the pain that makes equipment desirable.
2. **The investment moment.** You buy a category's repair equipment (e.g. the brake disc lathe).
   Real capex, real decision: "how many brake jobs before this pays off?" — a calculable payback
   the player can feel and the balance harness can measure.
3. **Post-investment — repair dominates for restoration.** With the equipment owned, repairing is
   almost always better than replacing (same-ish labor, no part cost). **Replacement stops being
   maintenance and becomes UPGRADE**: you either restore the stock brakes to 100% *or* install
   better-than-stock brakes. The parts market naturally pivots from "necessity vendor" (early) to
   "performance shop" (mid+), which is exactly what it should be.
4. **Late game — full capability.** All equipment owned; anything can be repaired in-house,
   culminating in the hardest unlock (full engine rebuild). At that point the only reasons to buy
   parts are performance, authenticity (genuine period parts for collectors), and upgrades — the
   endgame economy the GDD already wants.

**Labor parity rule:** repair and replace cost roughly the SAME labor for a given category. The
trade-off must be *part cost vs. equipment ownership*, never "repair is also faster." If repair were
cheaper on labor too, replacement would be strictly dead post-investment; parity keeps upgrade
installs sensible.

## Equipment unlock ladder (easiest real-world repair → hardest)

Ordered by real-world difficulty, which doubles as price/act progression. First-pass table — names
and prices are content-law JSON when built:

| # | Equipment | Unlocks repair of | Real-world logic | Rough era price | Act |
|---|---|---|---|---|---|
| 1 | Tire machine & balancer | wheels/tires | Mount, balance, patch — the classic first shop tool | ~¥150k | 1 |
| 2 | Brake service kit + disc lathe | brakes | Pads, skim discs, hone calipers — high-frequency, low-skill | ~¥250k | 1 |
| 3 | Suspension press & spring tools | suspension | Bushings, ball joints, strut rebuilds | ~¥400k | 1–2 |
| 4 | Upholstery & trim bench | interior | Seats, trim, headliners — fiddly but low-tech | ~¥350k | 2 |
| 5 | Welder + panel tools | body (structural) | Rust cut-and-weld, panel beating | ~¥700k | 2 |
| 6 | Spray booth | body (finish) | Respray, blend — needs the booth, big footprint | ~¥1.2M | 2–3 |
| 7 | Transmission bench | drivetrain | Clutch overhauls, gearbox/diff rebuilds | ~¥900k | 3 |
| 8 | Engine crane + stand + tooling | engine (top-end) | Head work, timing, seals — engine-out capability | ~¥1.5M | 3 |
| 9 | Machine-shop corner | engine (full rebuild) | Bore, hone, balance — the capstone | ~¥3M+ | 3–4 |

Notes:
- **Body may want two stages** (structural vs. finish) — it's the most visible repair category and
  the GDD's art pipeline (ride height, aero, livery) makes body state showable. Collapsible to one
  if two feels fussy.
- The ladder maps cleanly onto the GDD §258 example list (lift → dyno → crane → welder → aero
  bench); the *dyno* stays a build/tuning tool, not a repair tool.
- Zone mapping: today's five condition zones (engine/drivetrain/suspension/body/interior) each get
  1–2 equipment steps; wheels and brakes are currently *slots* without condition zones — see "model
  reconciliation" below.

## What this fixes in the current model (honest assessment)

Today's `repair-zone` is the weakest mechanic in the sim: spend labor → zone snaps to 100, no
tools, no parts, no grounding. Three real problems this design solves:

1. **Repair is currently free value.** Restoring a wreck costs only labor, making flips too clean
   and making the parts market optional for restoration. Gating repair behind equipment makes early
   restoration *cost real money* (via forced part replacement) — which also directly addresses the
   external review's "restoration may be under-rewarded" signal from the other side: restoration
   isn't under-rewarded so much as under-*costed*; this gives its economics texture.
2. **No reason to own equipment.** The GDD promises "you can't build what you can't lift" but
   nothing in the sim buys or checks tools. This is the missing system, and repair capability is a
   better first use of it than job-tier gating (more intuitive, felt every day).
3. **The parts market has one gear.** Forced-early-replacement + upgrade-later gives it two distinct
   economic roles across the arc.

## Model: unified per-component health (Option B — committed 2026-07-09)

**Decision: we build the clean model, not the pragmatic patch.** The maintainer's call — "design it
right from the start, no shortcuts; if B is cleaner, do B." Today's split of **condition zones**
(engine/drivetrain/suspension/body/interior) from **build-sheet slots**
(engine/forcedInduction/drivetrain/suspension/brakes/bodyAero/wheelsInterior) is the source of the
repair mechanic's vagueness. B collapses them into one truth: **a car is a set of components, each
with its own condition and its own optional installed part.**

### The canonical component (replaces both zones and slots)

Every car is `components: Record<ComponentId, { condition: 0–100, installed: PartInstance | null }>`.
Eight components reconcile the current five zones + seven slots:

| Component | From old zone | From old slot | Repair equipment | Present-if |
|---|---|---|---|---|
| `engine` | engine | engine | engine crane + machine shop | always |
| `forcedInduction` | (engine, shared) | forcedInduction | engine tooling | Turbo/Rotary tag only |
| `drivetrain` | drivetrain | drivetrain | transmission bench | always |
| `suspension` | suspension | suspension | suspension press | always |
| `brakes` | (new) | brakes | brake lathe | always |
| `wheels` | (new) | wheelsInterior (split) | tire machine | always |
| `body` | body | bodyAero | welder + spray booth | always |
| `interior` | interior | wheelsInterior (split) | upholstery bench | always |

Each component answers all three questions cleanly: **condition** = what degrades, **installed** =
what's fitted (stock or upgrade), **equipment** = what tool repairs it. No orphan slots, no
zone-less parts.

### The two operations, unified

- **Repair(component):** requires the component's equipment; restores `condition → 100`; costs labor
  + small consumables; leaves `installed` untouched (you fix what's fitted).
- **Replace(component, part):** installs a part into the component; costs part price + labor; sets
  `condition → 100` and swaps `installed`. Stock-grade part = maintenance; better-grade = upgrade.

### Derived stats, lemon rule, valuation all read components

- `computeDerivedStats` reads each component's `condition` + `installed` part modifiers (it already
  does this per zone/slot — it merges to one loop over components).
- The sliding-scale **lemon rule** rolls hidden-issue severity onto a component's `condition`
  (unchanged logic, new target).
- **Authenticity**: a component still carrying its stock `installed` (or null = factory) and high
  condition reads as authentic; the repair path preserves this, the replace path (non-genuine)
  costs it — the collector alignment falls out naturally.
- Buyer valuation and market pricing read the component rollup (a simple average or weighted sum for
  the headline "condition" the UI still shows).

### Migration (the real cost — planned, not hand-waved)

This is a foundational change to `CarInstance`, so it's a **major save-law event**: `SAVE_VERSION`
bump + an explicit migration that maps every old car:
`components.engine.condition ← old condition.engine`, ... for the five zones; `brakes`/`wheels`/
`forcedInduction` conditions default to 100 (assume serviceable) on migration; `installed` ←
old `buildSheet[slot]` (with `wheelsInterior` → `wheels.installed`, `interior.installed = null`).
Ripple: `CarInstanceSchema`, `computeDerivedStats`, `resolveHandoverCondition` (lemon rule), auction
car generation, valuation/selling, both sim golden masters (re-pin), the car-detail radar/zone UI,
and Sprint 08's `ServiceJob.requiredSlot` (becomes a `ComponentId`). All done in **this system's
sprint** — quarantined there, not smeared across earlier work.

### Why B is worth the migration

One condition surface means repair, replace, equipment gating, hidden issues, authenticity, and the
radar all speak the same vocabulary — no zone↔slot mapping table to keep consistent forever, no
"which zone does a brake part affect?" special-casing. Option A would have left that mapping as
permanent tech debt precisely in the system we most want to extend later (staff repair specialties,
severity-gated repairability, second-hand equipment). Pay the migration once, here.

## Interactions with everything else (why this is a spine, not a feature)

- **Service jobs (Sprint 08):** customer requests split naturally into *repair* jobs (need the
  equipment — can't even accept them without it) and *replace/fit* jobs (need a part). Early game,
  the job board skews toward replace-jobs and easy repairs (tires, brakes) — which IS the tutorial
  arc. Job generation should eventually filter/weight by owned equipment.
- **Facilities (bays):** equipment may demand bay space or a dedicated corner (spray booth
  especially) — a natural coupling to `facilities-bays.md`; expansion pressure comes from both.
- **Skill/XP:** skill makes repair *faster/better*, equipment makes it *possible* — exactly the
  "skill optimizes, tools unlock" guardrail from `skill-progression.md`. Repairing trains the
  matching skill.
- **Hidden issues / lemon rule:** a hidden issue's zone determines which equipment can fix it —
  buying a lemon you can't afford to fix (parts) or can't fix in-house (no tool) becomes a real
  risk-read at auction. Severity could later gate repairability (a truly destroyed part must be
  replaced) — optional spice, not v1 of this system.
- **Valuation/authenticity:** repair preserves the stock part (authenticity-friendly, collectors);
  replacement with non-genuine parts already costs authenticity in `computeDerivedStats`. The
  repair path is thus the *collector* path — a nice emergent alignment, worth preserving.
- **Balance harness:** each equipment purchase has a measurable payback period; bots that buy
  equipment early vs. never should diverge measurably. New report columns: equipment owned over
  time, repair-vs-replace ratio, cost-per-restored-car.

## Economic guardrails

- **Equipment is pure capex, priced so payback ≈ N jobs of its category** (N tunable per rung;
  early rungs pay back fast, late rungs slowly — matching act pacing).
- **Repair keeps a small consumables cost** (a fraction of the equivalent part price, e.g. 10–20%)
  so repair isn't literally free and the parts market retains a sliver of maintenance revenue.
- **Never gate by money alone** (GDD): late-ladder equipment can also want reputation and/or shop
  space (facilities), so a lucky early windfall can't skip the climb.

## Sequencing recommendation

This is **too big for one sprint** and should NOT block Sprint 08:

1. **Sprint 08 (service jobs) proceeds with the current simple repair** — its job templates are
   already split repair-only vs. part-install, which is this system's seam. Nothing shipped there
   is wasted; equipment gating tightens *which* repair jobs appear later.
2. **Facilities sprint** (already committed, directly after 08) ships bays; equipment wants bay/space
   context to exist.
3. **Equipment & repair-vs-replace sprint** (this doc) lands around the roadmap's Sprint 14 slot
   ("equipment purchases as unlocks") — ideally as *the* Sprint 14, replacing its vaguer bullet.
   It needs: the **Option-B component refactor of `CarInstance`** (+ its save-law migration), the
   equipment catalog (content JSON), purchase actions, per-component repair gated by owned equipment,
   the stock-part "replace as maintenance" path, harness columns, and a Handyman/Investor bot pair to
   validate payback curves. Because it refactors the condition model, it's a large sprint — likely
   split into (14a) the component migration and (14b) the equipment/repair economy on top.

## Open questions (settle at sprint start)

- Component condition **decay**: do components degrade with mileage/use/time, or only start rough
  from auction? (Affects whether repair is recurring maintenance or one-time restoration.)
- Consumables cost on repair: flat per repair, or % of the equivalent part price?
- Can hidden-issue severity make a component **unrepairable** (must-replace), and from which rung?
- Does equipment occupy parking/bay space (couples to facilities) or a separate "wall space" track?
- Second-hand equipment market (cheaper, condition-degraded tools) — flavorful, defer?
- The headline "condition %" the UI/valuation shows: plain average across components, or weighted
  (engine/body heavier than wheels)?
