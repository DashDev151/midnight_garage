# Machining: an authenticity-cost baseline

**Status: BASELINE DATA ONLY, supplied by the maintainer on 2026-07-31. Stand-in figures,
expected to be workshopped. Not signed content: no value in this document may be pulled into
`economy.json`, mission payouts, or any sim formula without directive-22 sign-off, one lever at a
time. This document is not the machining system, it is the starting point for designing one; see
"What this exposes", below.**

## Where this sits

`docs/design/systems/tuning-system.md` section 4 ("Three ways a part gets better") already covers
machining conceptually: it is avenue 3 alongside repair and fitting aftermarket, its performance
ceiling sits above stock, and its authenticity cost is preserved rather than destroyed. That
document explicitly scopes the full feature out of itself, listing "Machining (section 4). A real
feature with its own scope; this system must not foreclose it" among what it defers. Section 4b is
also explicit that `machineShopAssist` is **not** the home for machining.
`docs/design/systems/workshop-topology.md` records that machining has nowhere to physically happen
yet ("the facility does not exist"). Neither document holds a per-operation table, and no other
document under `docs/design/` does either, so this is a new document rather than an addition to
either of those.

`economy.machineShopAssist.feeYenByGroup` is a different mechanic again and must not be confused
with this table: it is a daily hire fee that gates whether buried or signature repair work can be
done at all (`docs/design/systems/tooling-system.md`), unrelated to any of the operations below.
**None of the operations in this table exist as a game action.**

## The table, as supplied

| Engine part | Machining action | Short description | Direct or supports | NA gain | Turbo gain* | Authenticity (1-10) |
|---|---|---|---|---|---|---|
| Cylinder head | Port & polish, gasket match | Smooths and enlarges intake/exhaust ports for airflow | Direct + supports | +5-8% | +12% | 6 |
| Cylinder head | 3/5-angle valve job | Recuts valve seats for better flow and sealing | Direct | +1-3% | +3% | 1 |
| Cylinder head | Milling / skimming | Removes deck material to raise compression ratio | Direct | +2-4% | ~0%** | 5 |
| Combustion chamber | Deshrouding / blending | Unshrouds valves, smooths chamber edges | Direct | +1-2% | +2% | 5 |
| Block | Bore & hone (OEM oversize pistons) | More displacement, fresh walls, better ring seal | Direct + supports | +1-2% | +5% | 8 |
| Block | Decking | Flattens deck, tightens squish, improves gasket seal | Supports | +1% | +5% | 6 |
| Block | O-ringing the deck | Wire groove so head gasket survives high boost | Supports only | 0% | +15% | 9 |
| Rotating assembly | Full balance (crank, rods, pistons, flywheel) | Smooth, reliable high-rpm operation; safer redline | Supports | +0-1% | +4% | 1 |
| Con rods | Shot peen & polish | Relieves stress risers so stock rods take more load | Supports only | 0% | +4% | 2 |
| Crankshaft | Journal polish | Reduces bearing friction and wear | Supports | ~0% | +1% | 1 |
| Crankshaft | Knife-edging | Sharpens counterweights to cut windage losses | Direct (tiny) | +0-1% | +1% | 6 |
| Flywheel | Lightening | Faster rev pickup; no change to peak power | Neither (feel) | 0% | 0% | 4 |
| Camshaft | Regrind (more lift/duration) | Regrinds stock profile for more aggressive timing | Direct | +5-10% | +3% | 7 |

\* The turbo column assumes boost is pushed up because the machining allows it. The roughly +55%
total enabled gain is divided across components by how much each one enables it.

\*\* Milling is usually skipped on turbo builds, because higher static compression limits how much
boost can be run.

**Authenticity scale, the maintainer's own wording:** 1-2 = purist shrugs, 4-6 = raised eyebrow,
7-9 = collector weeps.

## Why this exists

`docs/design/systems/desirability-system.md` makes authenticity a derived fact about a car:
all-stock and all-mint is perfect authenticity, fitting aftermarket parts lowers it, and
"machining work adds performance without meaningfully degrading it". That document's Q4 asks what
"does not meaningfully degrade" means in numbers, and flags that zero would make machining
strictly dominant for the restoration route. This table is the maintainer's answer in substance:
a real, per-operation cost, not zero.

The maintainer's own framing of the target: a completely stock engine in perfect condition is
perfect authenticity; an engine swap or a pile of modern race parts is very low; boring the engine
sits in the middle but much closer to the authentic end. A rough figure they floated is around 90
per cent of authenticity retained in trade for better performance, varying by how aggressive the
operation is.

## What the table already shows

Sorted by authenticity cost, the cheap operations (3/5-angle valve job 1, full balance 1, journal
polish 1, con-rod shot peening 2) are exactly what a restoration shop does to a numbers-matching
engine, and the expensive ones (camshaft regrind 7, bore and hone 8, O-ringing the deck 9) are
boost preparation. A restorer can gain real performance without losing much authenticity, and a
tuner pays for going further, and the split falls out of the physical facts rather than a special
rule written to produce it.

This satisfies the maintainer's standing constraint, quoted in `desirability-system.md`: *"we
should not make it impossible to have a car that is both a well performing and authentic."*

## What this exposes

The machining system **does not exist**. `economy.machineShopAssist.feeYenByGroup` is a daily
hire fee that gates whether buried or signature work can be done at all; it is not a machining
system, and none of the operations in the table above exist as actions a player can take.
Authenticity therefore cannot be finished (`desirability-system.md` Q4) until machining is
designed: this table is the starting point for that design, not a lever table for a system that
already ships.
