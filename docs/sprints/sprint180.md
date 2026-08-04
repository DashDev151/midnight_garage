# Sprint 180: one chassis, six skins

**Arc:** `docs/sprints/scene-standing-arc.md`. Step 7.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, section 6.

The payload of The Shop stage: six craft operations, the survivors of the old techniques by name.

## Goal

**Standing at the top of a scene lets you do something to a car that nobody else can**, and the car
carries the proof.

## The chassis already exists

**Machining is the shape**, and it is already built and shipped. An operation is authored as:

```
{ id, displayName, description, carPartId, powerFraction (per engine character),
  spec, authenticityCost, labourPoints }
```

applied per `PartInstance`, with `gradeMultiplier`, `reliabilityCostPerOperation` and
`valuePremiumPerOperation` alongside in `economy.json`.

**Generalise that, then author six parameter sets.** The design is explicit that solo-project scope
depends on this collapse: six bespoke systems is not a sprint, six skins on a proven chassis is.

## The six

| scene | operation | state it writes |
| --- | --- | --- |
| Racers | **Race prep** | handling and power past catalogue on installed parts, coherence-supported |
| Touge | **Corner weighting** | the handling-biased twin of race prep, the old suspension technique finally with a home |
| Tuners | **Blueprint building** | machining generalised: power past catalogue at reduced **originality** cost |
| Show Crowd | **Show fitment** | style past catalogue |
| Collectors | **Period-correct restoration** | repair and machining at reduced **authenticity** cost. Spends less of the car's originality, never less money |
| Daily Drivers | **Sorting** | a *sorted* state: reliability past what the condition band implies. "A properly sorted car" is the period trade's own phrase for exactly this |

## The laws these obey

**No cost or rate discount anywhere, in any of them.** An earlier draft's "recommissioning (cheap)"
was a banned mechanic and was replaced by sorting. **Reduced originality or authenticity cost is car
state, not player cost, and is legal**; reduced yen or labour is not.

**Purely additive capability.** Nothing basic sits behind an operation and no existing work is
gated. The first law holds.

**Money follows the metal, never the seller.** An operation writes inspectable state onto the car;
the existing stat-blind `marketValueYen` and the taste system read that state. There is no
multiplier on the person.

**Possessing an operation also makes it available as a service job.** The old signature jobs survive
as the service-lane expression of the same capability, a side effect rather than the payload.

## The interaction to establish BEFORE building

The design flags this itself and it is the sprint's real risk.

**`repairCeilingForLevel` clamps which condition band a repair can reach, by tool tier**
(`bands.ts`, reading `economy.repairBandCeilingByTier`, applied through `clampRepairTarget`). It caps
the band; it says nothing about stats.

**Sorting and race prep push a contribution PAST what the band implies.** So they do not collide
head-on with the clamp, but they raise a real question: **can an operation let a tier-1 shop exceed
what tier-3 tools would give?** If it can, the tool ladder is undercut, and Capability's exclusive
claim on throughput and ceilings, which the bible keeps, is broken by the back door.

**The maintainer's ruling, 2026-08-04: no, and the ladder must read**

```
tier 1  <  tier 1 + craft  <  tier 2  <  tier 2 + craft  <  tier 3  <  tier 3 + craft
```

**An operation adds on top of whatever band the tools actually reached.** It never substitutes for a
tier. Standing makes your tools go further; it never replaces them, and Capability keeps its
exclusive claim on ceilings.

**But that ladder cannot be built today, and this is a blocker rather than a caveat.**
`economy.repairBandCeilingByTier` is `{1: "fine", 2: "mint", 3: "mint"}`: **tier 2 already reaches
mint and tier 3 adds no quality at all.** Everything tier 3 buys is elsewhere, in labour per band
step (5 / 4 / 3) and two unlocks (NA-to-turbo, machining). Two rungs of the intended six tie.

**The tool ladder needs its own investigation and fix before this sprint can build**, carried in
`TODO.md`. Either the bands stretch, or tier 2 stops short of mint, or tier 3's claim moves off
reach entirely. All three are design decisions touching the progression bible's Capability pillar.

Second, smaller: **the derived-stat normalisation.** Stats are 0-100 and several are weighted means
over part bands. "Past catalogue" has to mean something precise in that arithmetic rather than
"add some".

## Reuse analysis (directive 16)

| concern | what already does it |
| --- | --- |
| An operation applied to a part, stored on it | `machining.ts`: `machiningOf`, `appliedOperationsOf`, `machiningOperationsForSlot` |
| Authoring an operation | the `machining.operations` array shape |
| Charging labour and money for one | the machining flow and the machine shop |
| Value credit for work done | `machiningPremiumYenOf` and `installedPartsValueYen`, already stat-blind |
| Authenticity cost | `machiningCost` in `derivedStats.ts`, already charging stock-grade parts only |
| Gating on a capability | `hasMachineLineFor`, and the machine-shop room's own gate |

**Genuinely new:** the generalisation itself, the five non-power state kinds (handling, style,
reliability, authenticity-discount), and the standing gate.

## Levers (directive 22)

**Not approved, and there are a lot.** Every operation needs its magnitude, its labour cost, its
money cost and its authenticity cost, times six. **Author them as one table, approved once**, rather
than six separate conversations, and anchor each against machining's existing figures so the six
sit on one scale.

## Definition of done

1. One operation implementation, six authored parameter sets.
2. Each writes inspectable state that the existing valuation and taste machinery already reads,
   with no new pricing path.
3. No operation discounts money or labour.
4. No operation lets a tier-1 shop out-reach tier-3 tools.
5. Possessing one offers the matching service job.
6. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately not here

- **Teardown condition preservation** (a master's head comes out as it went in). Noted in the design
  as unowned and low priority.
- The teardown of the old system (sprint 181).

## Exit

**Built.** `economy.machining.operations` (`machining.ts`, generalised) now holds two families on
one shape: the four original engine operations, unchanged, and six new scene operations, each
gated on a scene's Shop-stage standing plus tier 3 of the tool line its own `carPartId` belongs to
(`craftOperationCapabilityGateReason`, `machiningJobs.ts`). No parallel system, no rename of the
shared array or its accessors.

### The gate

`economy.machining.craftOperationToolTier` (new, value 3) is the tool half for all six; the
original four keep `minEngineToolTier` (unchanged, still 3) untouched. The scene half reads
`state.sceneStanding[operation.scene] === 'shop'`. Both are required; a tier-1 or tier-2 shop
cannot possess any of the six regardless of standing, which is the tier-ladder invariant, proved
directly in `craftOperations.test.ts`.

### The six, and how each was calibrated

Magnitude target: one operation is worth roughly one grade step on the axis it writes, read from
the catalogue's own grade ladders rather than invented. Labour (5 points) and money (none) are
anchored to the four original operations' own figures, so all ten operations sit on one scale.

| id | scene | slot / line | writes | magnitude | authenticityCost | calibration |
| --- | --- | --- | --- | --- | --- | --- |
| `race-prep` | Racers | `dampers` / suspension | power + handling, coherence-supported | powerFraction 0.0065/0.0085/0.0065, handlingFraction 0.005 | 3 | half the average engine-slot grade step (power) plus half the dampers grade step (+0.01/step measured), split since the operation spans two axes |
| `corner-weighting` | Touge | `springs` / suspension | handling only | handlingFraction 0.01 | 2 | one full springs grade step (measured +0.01 per step, matching dampers) |
| `blueprint-building` | Tuners | `internals` / engine | power only, reduced authenticity cost | powerFraction 0.013/0.017/0.013 | 1 | one full internals grade step (averaged across stock-street-sport-race) |
| `show-fitment` | Show Crowd | `rims` / wheels | style only | style 5 points | 3 | one full rims grade step (+6/+4/+4 measured, averaged) |
| `period-correct-restoration` | Collectors | `block` / engine | spec (support), reduced authenticity cost | spec 0.25 | 1 | mid-range of the block slot's existing spec-carrying operations (0.15-0.35); no grade ladder exists for spec, so anchored to the existing band instead |
| `sorting` | Daily Drivers | `differential` / drivetrain | reliability past the condition band | reliabilityConditionBonus 0.15 | 2 | the mint-to-fine band step (`economy.bands.bandFactors`), applied as a flat car-level addition to reliability's own condition factor - routing it through the per-slot weighted mean would dilute it to near-nothing given the differential's small taxonomy weight |

Every one of the six carries `labourPoints: 5` (the original four's own figure) and no money cost
at all (machining's own precedent: the tooling is the purchase, labour is what a job spends after
that).

Two genuinely new mechanisms, both minimal, reusing the existing per-part accumulation shape power
already had:

- **Handling and style each gained a "past catalogue" addition**, mirroring power's own
  `catalogue + operation` term exactly: `machiningHandlingFractionOf` (new, a fraction of the car's
  own mint handling, wear- and grade-scaled) and `machiningStylePointsOf` (new, raw points folded
  into the fitted part's own style points before the existing band scaling). Reliability's addition
  (`machiningReliabilityConditionBonusOf`) is deliberately NOT routed through the coherence/`spec`
  channel that already existed - that channel is capped at 1 on a merely-adequate build and would
  have been inert on the ordinary daily driver sorting is written for. It lands on the condition
  term instead, which is what makes "past what the condition band implies" literally true.
- **`coherenceSupported`** (new boolean, race prep only): its power and handling fractions are
  scaled by `coherenceFactorFor(supportVerdict(...).headline, economy)`, computed once per car in
  `computeDerivedStats` and threaded into both accumulation points.

### Service jobs

`ServiceJobType.requiresOperationId` (new, content) is the second route to a signature template's
existing gate, OR'd with `requiresTechnique` (`signatureGateSatisfied`, `serviceJobs.ts`) - a
template unlocked by EITHER route, never both required. Three existing templates
(`full-blueprint-build`, `corner-weighted-setup`, `show-fitment-program`) gained the new field
alongside their old one, so they keep working unchanged today and will keep working unchanged once
the old technique system is torn down. Three new templates (`race-prep-job`,
`period-correct-restoration-job`, `sorting-job`) are gated on the new route alone.

### UI

`StandingScreen.vue`'s existing Scenes panel gained two sections per scene: the scene's live
commission (brief, Accept when offered; a car picker, Check fit and Deliver when active, reusing
`gradeSceneCommissionCar`/`resolveDeliverSceneCommission` sim-side) and its operation (name,
description, and which half of the gate is still missing). Performing an unlocked operation itself
stays on the Machine Shop screen, which needed no new plumbing at all: `machinableSlots` and
`machiningReadingFor` already read the whole combined catalogue generically, so the six new slots
and operations simply appeared there once authored. `MachineShopScreen.vue` gained the
`scene-standing` refusal copy and a tier-agnostic tool-tier message (was
"the machine-shop tooling on the engine line", now "tier 3 of the tool line this job uses").

### Laws checked

- No cost or rate discount: every one of the six costs 5 labour points and no money, matching the
  original four exactly. Only `authenticityCost` varies, and only downward for the two operations
  the design names as reduced (`blueprint-building`, `period-correct-restoration`), which is
  legal car-state, not a player-cost discount.
- Purely additive: nothing existing is gated behind a scene operation.
- Money follows the metal: every one of the six reaches value through the existing
  `machiningPremiumYenOf` / `installedPartsValueYen` path, stat-blind, unchanged. Verified directly
  in `craftOperations.test.ts`.
- Possessing one offers the matching service job: verified directly.

### Verification

- `pnpm typecheck` clean across `content`, `sim`, `game`.
- All three Vitest projects run once, in full: sim 2317/2317, content 611/611, game 955/955, all
  green.
- New: `packages/sim/tests/craftOperations.test.ts` (39 tests) - the catalogue shape, the gate at
  every tier for every operation, the tier-ladder invariant, the value/authenticity path, sorting's
  condition-factor addition, and race prep's coherence scaling (including that a
  non-coherence-supported operation does NOT scale the same way).
- Diagnosed and fixed as stale (directive 17 case (a), not a regression): three existing test
  files iterated the WHOLE `economy.machining.operations` array assuming it still held only the
  original nine (`machining.test.ts`, `machiningPowerModel.test.ts`, `authenticity.test.ts`) -
  each now scopes its own `operations` binding to `o.scene === undefined` with a comment
  explaining why, since the array is now deliberately a superset. One assertion string changed
  (`MachineShopScreen.test.ts`: "tooling" to "tier 3", matching the now tier-line-agnostic refusal
  copy).
- `economy.json`'s approval-gate hash re-pinned with the full lever list recorded in
  `economyApprovalGate.test.ts`'s own comment, per directive 22.

### Left as noted risk, not fixed here

`docs/design/systems/tier-three-unlocks.md` remains unsigned design; this sprint used only the one
ruling from it the arc index already recorded as settled (`craftOperationToolTier` fixed at 3,
"standing ungates the tool"). The rest of that document (grade-gates-tool-tier, the chassis jig,
the roll cage, and so on) is unbuilt and out of scope here.
