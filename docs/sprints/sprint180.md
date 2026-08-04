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

**Establish the answer first and write it down.** The likely shape: an operation extends the
condition-ceiling system rather than bypassing it, so it adds on top of whatever band the tools
actually reached.

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

_To be completed at the end of the sprint._
