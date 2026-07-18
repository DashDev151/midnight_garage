# The tooling system - unified design (2026-07-18)

Source of truth for Sprints 92 (uniform access) and 93 (band ceiling). Written after a full
read of the existing tool-line/upgrade/rental machinery (discovery 2026-07-18). This is a
COHESION pass: almost every piece already exists; the job is to make one consistent rule out
of three half-built ones, not to add a parallel system.

## The problem: three inconsistent half-rules today

1. **Access is gated for only 3 of 6 groups.** Engine and drivetrain tier-2 machines
   (crane, bench) gate pulling buried parts; the wheels tier-2 (tyre machine) gates fitting
   a tyre. Suspension, body and interior tier-2 machines exist in content with real prices
   and reputation gates (`toolLines.json`) but gate NOTHING on your own car; they only make
   repairs faster.
2. **Band reachability ignores tools entirely.** `repairLevelForGroup` = the tool tier, and
   tier only scales labour slots (`slotsNeededToClimb = ceil(grades / level)`); cost is
   tier-independent and ANY repairable part reaches mint at tier 1, just slower
   (`bands.ts:376-379`). Yet the content already authors `minToolTier: 2/3` on every
   mint-band service task, so the offer layer says "mint needs better tools" while the
   repair engine says "tier 1 is fine". The engine is the half that is wrong.
3. **Rental exists for only 3 groups and is invisible.** `machineShopAssist.feeYenByGroup`
   covers engine/drivetrain/wheels only; suspension/body/interior have no fee mechanism.
   And the fee is never shown on the Upgrades screen; the player discovers it existed only
   when it disappears after buying the machine.

## The unified model: tool tier is capability, per group, always rentable

One rule. A group's **tool tier is its capability level**, and it governs three things at
once. Below tier-2, that capability is still reachable by **renting** the machine per
operation (the existing machine-shop-assist model, extended to all six groups): **nothing is
ever impossible on day one; owning the machine removes the fee and adds speed.** This is the
maintainer's own standing ruling (tools buy margin, not possibility), now applied uniformly.

### Axis 1 - ACCESS: each group has a signature heavy operation needing tier-2

Every group gets one signature operation that physically needs its tier-2 machine (own, or
pay the group's rental fee). The three that exist stay; three are added:

| Group | Tier-2 machine | Signature op it gates | Status |
| --- | --- | --- | --- |
| engine | Engine crane & stand | pull the engine assembly (buried internals) | exists |
| drivetrain | Transmission bench | pull the gearbox assembly (buried) | exists |
| wheels | Tyre machine & balancer | mount & balance a tyre | exists |
| suspension | Two-post lift | fit/replace dampers & springs (spring compression) | NEW |
| body | MIG welder & panel tools | panel & structural repair (weld/beat) | NEW |
| interior | Upholstery & trim bench | retrim seats & dash | NEW |

Light bolt-on work (swap an intake, bolt on pads, fit an anti-roll bar link) stays tier-1
hand-tool work: no fee, always in-house. The signature op is the *heavy* op, not all work in
the group, exactly as the engine crane gates the engine pull and not every spark-plug change.

### Axis 2 - BAND CEILING: tier caps the finish quality

The tool tier caps how good a repair can get, matching what the content already declares:

| Tier | Repair ceiling |
| --- | --- |
| 1 (owned by all) | up to **fine** |
| 2 (owned or rented) | up to **mint** |
| 3 (owned) | mint (top band) + master advantage, see Axis 3 |

**Soft cap via rental (the key decision):** a tier-1 shop CAN finish a part to mint by
renting the group's tier-2 machine for that repair (the same per-op fee as Axis 1). It is
never a wall, only a cost. This preserves day-one satisfiability of every mint-band mission
and keeps rare-car restoration possible for a fresh shop, at a thinner margin, which is
exactly the incentive to eventually own the machines.

Replacement is unaffected: buying a new part always yields a mint part (you are buying, not
finishing), so a scrap/non-repairable consumable (tyres, pads, clutch) is always replaceable
to mint at any tier. The ceiling is a *repair/finish* ceiling, not a parts ceiling.

### Axis 3 - MASTER (tier 3): the different advantage

Tier 3 is the master tier. It already gates the six advanced technique templates
(blueprint-build, dog-box, corner-weighting, show-fitment, one-off-widebody, bespoke-trim)
via their `minToolTier: 3` tasks, on top of the specialty-120 technique unlock. Under this
model tier 3's advantage is: **it is the tier those master builds require, and it removes the
rental fee on mint work (Axis 2) that a tier-2 shop would still be renting for the top
band.** (Concrete extra perk - a small quality/margin edge or a speed edge - is a tunable
left to Sprint 93's balancing; the structural role is "master builds + no top-band fee".)

### The charge model (no double-billing)

One rental fee per operation that invokes tier-2 capability, charged only when the group's
tier-2 is not owned. An operation invokes tier-2 capability if it is a signature heavy op
(Axis 1) OR it targets a band above fine (Axis 2). A single repair job that both pulls the
engine and finishes the head to mint pays the assembly's existing per-remove/per-refit fees
(Sprint 87 rule, unchanged) and nothing extra for the mint finish - the machine session
covers it. The fee always posts to the car/job ledger through the existing path, so budget
caps and job billing see it.

### Service jobs stay must-own; own-car/flip work is rent-or-own

Service-job tasks already carry `minToolTier` and are already uniform across all six groups:
you must OWN the tier to accept a job needing it (`resolveAcceptServiceJob`). That layer is
left as-is - owning tools unlocks better contracts, a clean ownership incentive, and taking a
paying customer's concours job you cannot do in-house is the one place renting should not
apply. The uniformity this design adds is on the own-car/flip side (Axes 1 and 2), which is
where the real inconsistency lived. (If the maintainer later wants service jobs rentable too,
it is a bounded follow-up; not proposed here.)

## Economic consequences (the re-derivation, Sprint 93's real work)

The soft cap changes MARGINS wherever mint work happens without owning tier-2; it makes
nothing impossible. The probes that assume tier-1 reaches mint for free must fold in the
rental fee:

- **The wage / coherence probe (economy-bible law 6).** `computeModelCoherence` plans rare
  cars to mint at fresh (tier-1) tools; the wage probe asserts a fresh shop profitably
  restores a rare car to mint. Re-derive to include the mint-work rental fee: the margin
  shrinks but must stay positive (owning the machines is the upgrade that widens it).
- **The 5 mint-band story missions** (`make-it-pull`, `the-column-clock`, `low-and-loud`,
  `street-power-street-manners`, `under-one-fifteen`). Their satisfiability probes build the
  car to mint directly; re-derive their budget caps to include the rental a tier-1 shop
  would pay, so each stays satisfiable day-one (and add the tool-satisfiability check the
  missions currently lack entirely - today nothing verifies the shop could ever produce the
  required band).
- **Reachability unit tests** (`bands.test.ts` "reaches the same partIds at any tier",
  `restorationPacing.test.ts` mint-at-tier-1, ~40 mint-target `jobs.test.ts` cases): update
  to the new contract - tier-1 caps at fine; mint needs tier-2 (owned or the fee).

## What already exists (reuse) vs genuinely new

**Reuse (do not rebuild):** the 6 tool lines + tiers + prices + rep gates
(`toolLines.json`); ownership state (`toolTiers`) and the purchase/classifieds pipeline;
`machineAssistFeeYen` / `assemblyMachineAssistFeeYen` and the ledger-posting path;
`repairLevelForGroup` / `slotsNeededToClimb`; the `minToolTier` service-job layer; the
coherence and satisfiability probe patterns; the Upgrades screen tool wall.

**New:** rental fee keys for suspension/body/interior (extend
`machineShopAssist.feeYenByGroup` from 3 to 6, and its schema + coherence probe); the three
new signature-op gates (Axis 1); the band ceiling in the repair planners (Axis 2) plus a
content `bandCeilingByTier` knob (default tier1=fine, tier2=mint); the tier-3 no-top-band-fee
rule and its perk; surfacing the rental fee on the Upgrades screen so the buy decision is
legible.

## Sprint split

- **Sprint 92 - uniform access (Axis 1) + rental made legible.** Extend the fee model to all
  six groups, wire the three new signature-op gates, surface rental on the Upgrades screen,
  extend the coherence fee probe to all six. No band-model change. Bounded.
- **Sprint 93 - the band ceiling (Axis 2 + Axis 3).** Tier caps repair band (soft, rental);
  tier-3 master rule; re-derive the wage probe, the 5 mint-missions, the reachability tests.
  The real rebalance, probe-gated.
