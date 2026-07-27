# The Workshop Rework (the working-on-a-car system)

**Status: FINAL. Maintainer-approved 2026-07-23** (design review conducted in session; every
open question ruled). This document is the canonical design for the workshop arc; amendments
require maintainer approval recorded here with a date. Implementation proceeds in the three
phases at the end; phase 1's sprint doc carries the complete lever list for directive-22
sign-off before any agent runs.

## The diagnosis

The old system commits one category error and everything else follows: it models EVERY
aspect of a car as "a part with a band", which is true of a gearbox, half-true of a panel,
and false of paint. Consequences the playtests paid for: removable paint, panels that
vanished when removed, a tile-grid interface with stacked ghost hit-areas, machine fees
hidden from totals, and no craft in the half of the era fantasy that is bodywork.

## The model: six zones, three layers

The body is SIX ZONES: **bonnet, boot, left, right, roof, chassis** (chassis absorbs
everything else: underbody, structure). Each zone carries three layers:

- **Metal**: dents, rust, straightness. Fixed by panel beating (hand tools), cut-and-weld
  (tier-2 MIG), or by REPLACING the panel with a real part.
- **Surface**: filler, sanding, primer, worked with consumable materials.
- **Finish**: paint and polish. **Paint is not a part and can never be removed.** A respray
  is staged work on chosen zones, and the colour is chosen at the paint stage (palette
  swap) from phase 1. The chassis zone's finish stage is underseal, not paint.

**The pipeline**: strip/prep, metalwork (beat, weld, or swap the panel), fill and sand,
prime, paint, polish. Every stage is a staged job in the existing staged-work machine. The
craft lives in the sequence and the decisions: repair the metal or swap the panel; stop at
tidy or chase show finish (which lands on the existing passion-spend disclosure law); keep
her colour or change it. Decision-paced is the current design choice, not a law:
non-mandatory minigames remain the maintainer's future prerogative; only mandatory reflex
input is banned (GDD hard rule).

## Parts, kits, and materials

- **Zone panels are real parts.** Bought from the market (the stock-grade panel SKUs become
  per-zone replacement panels) or harvested: from phase 1, stripping a car yields its
  zone-panels into the inventory. A panel swapped off a car goes to the inventory, always.
- **Materials are cheap consumable SKUs** in the parts market: filler, paper, primer, paint
  tins, polish: era-true, and they live inside the existing consumables-share law.
- **The kit family: `aero` widens to "aero and body kit".** Aftermarket body panels are
  bought as KITS: one bundled purchase covering all body parts: and install as a part with
  grades (street/sport/race), exactly as aero always has. The old aftermarket panel SKUs
  (lightweight panel kits) move here; underglow and its kin (style accessories mis-slotted
  as underbody) move here too. Zones cover stock body metal only.
- **Aftermarket paint SKUs retire outright.** Premium finishes (two-tone, pearl) return in
  phase 3 as paint-stage materials carrying the style stat.

## Value integration (stated precisely)

Zones are the WORK model's resolution; bands stay the VALUE model's resolution. The
`panels`/`paint`/`underbody` parts survive as value carriers whose bands DERIVE from zone
states (worst-governs, the foundation law's philosophy). The base-value half of the economy
(bands, bills, Laws 1-4) is structurally untouched, with one implementation obligation: the
body parts' repair-bill functions must price "what the pipeline costs to raise the derived
band" (materials + labour + panels), so Law 2's no-value-trap guarantee and the coherence
probes keep measuring reality. The aftermarket-premium half DOES move: the retired paint
SKUs and relocated panel/underglow SKUs change the Law 5 premium's inputs and the style
stat's carriers, so phase 1 re-derives the coherence tables and its sprint doc lists the
full SKU disposition and every materials price as levers for sign-off.

Generation rolls zone states (seeded, per lot) and derives the bands from them: the
core-loop floor (every car spawns with work) and Law 2's ceiling both hold through the
derived bills, probed as such.

## Labour (signed 2026-07-23)

| Lever | Was | Signed |
|---|---|---|
| Repair labour per band step, by tool tier | 10 / 6 / 4 | 5 / 4 / 3 |
| Fitting (install/refit to the car) | 10-class | 3-class (fitment classes scaled, common anchors at 3) |
| Removal | free | free |
| The day's pool | 60 | 60 for phase 1; the pool and per-staff contribution are equally live knobs for the post-rework tuning pass (directive 23) |

The config key `energyPerGradeByTier` renames to `energyPerBandStepByToolTier` in phase 1:
"grade" collides with part grades, "tier" with car tiers, and a config key should never
need explaining twice.

## Machine hire: a daily unlock, a running cost

Hire prices are unchanged (engine 15,000 / drivetrain 18,000 / body 14,000 / interior
7,000 / suspension 5,000 / wheels 3,000), but hire becomes a DAILY UNLOCK: pay a line's fee
once and its machinery is yours without limit until End Day: every car, every operation.
This makes tool hire planning gameplay (engine day today, bodywork day tomorrow) and
reclassifies it, like rent, as an overall running cost: it appears on the daily financial
summary and NEVER on a car's ledger. State is day-keyed (the auction-admission pattern).
Owning tier 2 retires a line's hire fee entirely.

## The honest ledger

A car's staged rows and Confirm button show ONE total: parts + labour: and resolution
charges exactly that total. Machine hire, being a running cost, lives on the daily summary.
No fee, anywhere, is ever charged but not shown where the player is looking.

## The interface: three views, regions on art

The tile grid dies. The 96x48 master sprite is far too small to carry clickable panels
(maintainer ruling): it remains the car's portrait, and **the body view is a REPRESENTATIVE
panel schematic**: one stylised, generously sized body diagram shared across all models,
its six zones as the click regions. Beside it: **the engine bay** (top-down) and **the
underside** (on the lift), one generic drawing each. Click targets are regions ON the art;
a removed or empty region can never occlude another (the ghost-tile bug class is
structurally impossible). Placeholder-art versions land first: the interaction model does
not wait for finished art.

## Tool gates

Tier 1 (hand tools, rattle cans): full pipeline access, finish ceiling at tidy (fine).
Tier 2 (MIG and panel tools): cut-and-weld metalwork, better finish floor and speed.
Tier 3 (booth and jig): show finish (mint) and chassis-straightening ceilings. The daily
hire covers whatever the shop does not own yet.

## Phasing

- **Phase 1, the model**: zones with derived bands and seeded generation; the six-stage
  pipeline as staged jobs; materials SKUs; panel provenance (market, donor, and
  swap-to-inventory); the kit-family migration and paint-SKU retirement; the signed labour
  table and the rename; the daily machine hire with its summary line; the honest per-car
  ledger. UI minimally adapted (zone list under the body area) so the model is playable
  before the views land. Its sprint doc opens with the complete lever list (SKU
  dispositions, materials prices, zone generation parameters) for sign-off, and closes
  with re-derived coherence.
- **Phase 2, the views**: the representative panel schematic, engine bay, and underside as
  the working interface, placeholder art first.
- **Phase 3, the flourishes**: premium finish materials (two-tone, pearl) with style
  weight; colour-taste coupling on resale; show-finish reputation moments.

## What this deliberately does not touch

The diagnosis/failure-map system; the bench and the mechanical part/band model (never the
broken half); auctions and selling; the no-mandatory-reflex hard rule; the value formulas
themselves. The rework is the WORK.
