# Sprint 191: one gate, a chassis you can actually fix, and a widebody that does something

**Status: LIVE. One task genuinely unbuilt and unsigned. This is the only open sprint in the repo.**

**Task 6 is the whole of what remains: gate sport and race zone panels on body level 3.** It never
started, its lever was never signed, and the code confirms it: `economy.json`
`toolCeilings.installGradeToolLevel` is `{stock: 1, street: 1, sport: 1, race: 2}`, which is the
signed *grade* rule only. There is no body-level gate on sport and race panels. It is load-bearing
beyond this sprint, because the contact-patch design depends on over-fenders being a real
prerequisite before wide tyres can gate on them.

**Task 7 is CLOSED.** Underglow was signed and built in sprint 197 at `style` 6 and
`authenticityCost` 0.3. The roll cage's blocker closed there too, at a daily-drivers handling
`upper` of 0.60, so only the cage SKU is outstanding and 197 records that.

Header corrected during the 2026-08-13 archive pass, which found this the single sprint with real
work left in it.

Design of record: `docs/design/systems/shop-content.md`.

Approved by the maintainer 2026-08-07 off that proposal. It cut the chassis jig, kept underglow by
reframing it as an operation, and turned up a live bug worth more than the feature it replaced.

## The three things this fixes

**A chassis at `scrap` is unfixable in the UI and fixable in the sim.** About one auction lot in 45
carries one, mostly from four authored failure modes that set it outright rather than from the band
roll. `replacesOccupiedSlot` (`jobs.ts:94`) permits replacing a `removable: false` slot in place,
names chassis in its own doc, and `bodyCarrierIdentity.test.ts` tests that install landing.
`plays.ts` already assumes the player takes that route when costing a sensible play. The store cuts
it off with one predicate that is wrong by exactly one slot.

**Widebody ships and does nothing.** 144 zone-scoped panel SKUs carry authored style points (street
5, sport 9, race 12) that can never reach a car, because `partFitsCar` refuses any SKU with a
`zoneId` and the panel install path writes to `zoneState` rather than to
`car.parts.panels.installed`, which is the only thing `stylePercentOf` sums. Fitting a full carbon
widebody today forfeits 11 authenticity points and drops the paint band, and gives nothing back.

**Five bespoke capability gates where there should be one**, and two of the three install paths have
no capability gate at all.

## LEVERS (directive 22)

**Two, both unsigned. No agent implementing either launches until they are.** Everything else in
this sprint moves no value and can proceed.

| lever | file | proposed | why |
| --- | --- | --- | --- |
| widebody's gate | `economy.json` | sport and race zone panels need **body at level 3** | the widebody unlock. Street stays open so a cheap panel is still a repair, not a statement |
| underglow's `style` | `economy.json` | **to be proposed with a number** | against the authored ladder, where a race wing is 18 and show fitment is 5 |
| underglow's `authenticityCost` | `economy.json` | **to be proposed with a number** | non-zero: a lit underside is not how it left the factory. Small, in the current 0 to 1.0 band |

**Already signed and still unbuilt:** the grade rule, maintainer 2026-08-04, `{ stock: 1, street: 1,
sport: 1, race: 2 }`. Race parts need their own line at rung 2 to INSTALL, and can still be removed
and sold. It costs zero authoring rows because `grade` is already on all 580 SKUs.

**Not in this sprint, and it needs its own signature:** the roll cage. It cannot work as intended
without an `upper` authored on handling for daily-drivers in `buyers.json`, because a cage cannot
add mass (schema refuses it), costs about one authenticity point on `chassis`, and no buyer reads a
part. Without that lever it is a strict upgrade, which is the opposite of the design.

## Reuse analysis (directive 16)

**New: one function.** `partCapabilityRequirement(part, car, state, context)` returning
`{ group, level } | null`. Everything else is deletion, rewiring, or one term added to an existing
sum.

**Existing mechanisms reused:**

- **The part declares nothing.** Every rule derives its `(group, level)` pair from `grade`,
  `carPartId`, `zoneId` and the car's own state, all of which are already authored. `parts.json` is
  580 hand-authored rows with no generator, so a required new field would be a manual sweep.
- **Every existing gate already reduces to `toolLevelsFor(state, context)[group] >= level`.** Five
  mechanisms become one composition; nothing newly expressible.
- `stylePercentOf` already walks the car and already sums authored style points. Widebody adds a
  term, not a system.
- `MachiningOperationSchema` already carries `style`, and `performedOn: 'fitted-part'` already means
  "done on an assembled car". Underglow is an entry, not a schema change.
- `replacesOccupiedSlot` already permits the chassis install. The fix is to stop hiding it.

**Nothing parallel is stood up.** No new slot, no new SKU, no second gate.

## Tasks

### Lever-free, start immediately

1. **Let the player replace a scrap chassis.** `gameStore.ts:1852` reads
   `replaceInPlace: isBodyDerivedPart(partId)` (panels and paint). It must read the taxonomy's
   `removable === false`, which is what the sim's `replacesOccupiedSlot` reads and which includes
   chassis. `installGateReasonFor` already handles the body-line gate for chassis, so the refusal
   copy exists.

2. **`repairJobGate` must say why.** At `jobs.ts:919` it returns `{ ok: false, log: [] }` on an
   empty plan, so unlike `bench-only`, `derived-band`, `tool-tier` and `machine-line` there is no
   reason for the screen to render. A scrap chassis is the case that exposed it. Give it a reason
   and surface it.

3. **The capability gate.** One function, composing the rules in order. Wire it at **all three**
   install paths, not one:
   - `installFitGate` (`jobs.ts:1022`) - ordinary slot parts. **Bots call this directly**
     (`advanceDay.ts:128`), so a gate placed in `findOrCreateJob` instead would silently exempt them.
   - `resolveSwapAssemblyMember` (`assemblies.ts:428`) - bench members including tyres.
   - `resolvePipelineInstallPanelAction` (`stagedWork.ts:489`) - **all 144 zone panels, which have
     no capability gate of any kind today.** A gate wired only into `installFitGate` misses widebody
     entirely.

   Collapse the five bespoke gates into it. Implement the signed grade rule as its first entry.

4. **Parts must be visible and refused, not hidden.** `installablePartsForPart` drops anything
   failing `partFitsCar`. A part you cannot fit yet is an advert for the shop that fits it, so it
   must render disabled with the tool it needs, named. This is a UI shape change rather than a copy
   change.

5. **Widebody reaches style.** `stylePercentOf` gains a term summing the nine zones' `panelGrade`
   against the same authored ladder every other slot uses. No new SKU, no new field.
   **Then fix the test that was passing on an impossible build**: `style.test.ts:38` picks the
   highest-style SKU per `carPartId` without filtering `zoneId` and force-installs it, so the
   "a fully dressed mint car scores exactly its own `styleCeiling`" assertion holds on a car no
   player can build. It must assert the real path.

### Blocked on signature

6. **Gate sport and race zone panels on body level 3**, through the gate from task 3, at the path
   from task 3 that has none today.
7. **Underglow**, one `economy.json` entry: an operation on `chassis`, `performedOn: 'fitted-part'`,
   carrying `style` and `authenticityCost`. It gates on the body and trim shop for free, because
   `craftOperationCapabilityGateReason` derives the line from the operation's own `carPartId` group.

## Definition of done

- A scrap chassis can be replaced from the car screen, gated on the body line exactly as the sim
  already gates it.
- No refusal in the repair path returns an empty log.
- One capability gate, wired at three install paths, with the five bespoke checks collapsed into it
  and the signed grade rule implemented.
- An ungated part renders refused with its requirement named, rather than vanishing.
- A fitted over-fender moves style, and the style test asserts a build a player can actually make.
- No `economy.json` value moves except the two signed levers, and the hash re-pinned with them.
- `pnpm typecheck` clean, all three projects green, pre-push gate green.

## Deliberately not here

- **The roll cage**, blocked on the `buyers.json` `upper` lever above.
- **The chassis jig, in both forms. Cut.** Severity 4 is already recoverable by buying a panel, so
  it rescues nothing and saves ¥2,600 to ¥25,400 on about one car in 1,560, at the cost of a
  three-way change to a deliberately-shared gate. And the scrap chassis it might have rescued turns
  out to be a UI bug, fixed in task 1.
- **The chassis shop's own content.** No honest proposal exists: a dog box needs a gear-shift term
  the performance model does not have, and faking it with `powerFraction` on `gearbox` would lie
  about what the part does. What it probably wants is the aero grade above `race` that
  `car-performance/README.md` records as deliberately open.
- **Renaming `economy.machining.operations`.** It has outgrown its name (corner weighting is scales
  under a car, show fitment is rolling arches, and underglow is neither), but renaming is churn and
  belongs in whatever next touches that block.

## Exit

The five lever-free tasks landed across three agents. The two signature-blocked tasks did not start.

### The chassis was never one line

The reported bug was `replaceInPlace` at `gameStore.ts:1852`. **Three store sites all meant "replaces
an occupied slot" and all asked `isBodyDerivedPart`**, so all three were wrong by exactly the
chassis:

- `carPartRowsInGroup` gave the row no Replace control;
- `installablePartsForPart` returned `[]` for an occupied chassis, so fixing only the button would
  have shipped **a Replace that opens an empty drawer**, plus a dead drop zone, since drag-to-fit
  gates on the same function;
- `stageAction`'s `slotTakesPart` would have refused the staged install outright.

All three now call the sim's own `replacesOccupiedSlot`; no predicate was duplicated.
`isBodyDerivedPart` stays at its three genuine zone-derived-band sites.

**Measured recovery on a real generated car** ('88 Honda Today, body shop owned): reliability **50 to
56**. Earlier analysis put a scrap chassis at 29 to 40 points, and that figure was the isolated case
with everything else mint; on a car whose other slots already hold the severity ceiling down, the
recovery is far smaller. Both are true; only the second is what a player feels.

### Two refusals, because they are two instructions

The empty-plan return at `repairJobGate` became **`beyond-repair`** (fit a replacement) and
**`nothing-to-repair`** (nothing is wrong). Collapsing them would have made a scrap chassis read as
"already good enough", the exact confusion this sprint exists to remove. Classification lives where
the filtering already lives: `GroupRepairPlan` gained `unrepairablePartIds`.

**`dayLogFormat.ts` now maps all twelve `job-blocked` reasons to plain sentences through an
exhaustive record**, so a future reason is a compile error rather than a raw token on screen. It
previously rendered every one as `Job <internal-id> blocked (<token>)`.

`confirmStagedWork`'s short-circuit is gone, so the sim's gate is the single authority and Confirm
emits both new reasons.

### One gate, four paths

`partCapabilityRequirement(part, car, state, context)` returns the first requirement the shop does
not meet, so `null` means fit it and a non-null pair is exactly what a refusal needs to name. Both
rules derive structurally and name the part's **own** line:

| rule | derives from |
| --- | --- |
| NA to turbo | `carPartId === 'forcedInduction'` and the car is factory-NA, needs engine 3 |
| grade ladder | `part.grade` against `toolCeilings.installGradeToolLevel`, needs that part's group at that level |

**Wired at four paths, not the three planned.** The fourth is `resolveRefitAssembly`'s foreign-car
half: a bench-BUILT container has no car to check at swap time, so its members first meet a car at
refit. Without it **a race rim could be built into a wheel assembly from bin parts and refitted
straight past the gate.**

**Removal stays ungated by construction**, which is the signed companion ruling: race parts beyond
your tools can be pulled off a bought car and sold. There is a test.

### The five bespoke gates survived, and the argument holds

They answer *"is that machinery available today"*, owned **or hired for the day**, and they gate
removals and hand-work stages. The new function answers *"do the shop's own lines stand high enough
to fit this at all"*, which was never hireable and which the signed ruling says must be owned. So the
count went six bespoke to **five machinery-availability plus one composition**; the gate that
actually collapsed is `naToTurboConversionBlocked`, now a one-line reading of the composition.

The full unification was identified and declined: a `hireable` flag would fold all five in, but done
naively **it makes turbo conversion purchasable for a day's engine-crane hire**, which is a
progression change wearing a refactor's clothes. Its own work.

### Widebody pays the mean, not the sum

Summing nine zones gives 108 against a `styleSaturationPoints` of 66, so one purchase would finish
the stat and make every other style part on that car worthless. The mean makes a full one-grade body
deliver **exactly the points its SKUs are authored with**, the same as any other slot, and it makes
the existing catalogue-spread test honest: it always counted `panels` as one 12-point slot, and now
that is true.

Measured, mint Civic SiR-II: **stock 45, full street panels 49, full race carbon 54.** A race wing
alone is 18, so the loudest body in the catalogue is worth two thirds of one wing.

**The test that passed on an impossible build is fixed.** `style.test.ts` picked the highest-style
SKU per slot without filtering `zoneId` and force-installed it. It now dresses the car through the
real path, best installable SKU per slot plus a race widebody fitted zone by zone, and is still
exact on every shipped car.

### Refused, not hidden, and it caught a bug the gate had just created

After task 3 the sim refused a race part correctly while `installablePartsForPart` checked only
`partFitsCar`, so **the part rendered enabled and clicking it silently did nothing.** Both pickers
now run the gate too, which is what makes the click path, the drag path and the sim refuse the
identical set.

The two refusals sit differently, because they are different facts. A part the tools cannot yet fit
is shown dimmed with the tool named, since it advertises the purchase that unlocks it. A part that
will never fit names no tool, because no purchase changes it. **The list ranks itself: installable,
then tool-gated, then never-fits.**

Copy names the rung or the shop, never a tier number:

> Needs Two-post lift
> Needs Machine shop
> Needs Two-post lift to fit it *(parts market)*

`installBlockedReason` was **deleted** rather than extended: it carried the NA-to-turbo rule that
the new composition now also carries, and keeping both is the duplication sprint 188's guard exists
to stop.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 621 passed |
| `pnpm test --project sim` | 2607 passed |
| `pnpm test --project game` | 1003 passed |
| `npx eslint` / `prettier --check` | clean |
| `packages/content/data/` diff | four values, the signed grade table |

Two tests were case (b), both an agent's own new work rather than a pre-existing regression: a date
written into a doc comment (caught by `commentHygieneGuard`) and a dead initialiser (caught by
ESLint). No shipped sim test needed changing for the gate or for style, which is the evidence that
no output moved but the ones intended.

### Found while working, deliberately not fixed

- **32 of 600 generated lots are born wearing a skirt kit as their entire bodyshell.**
  `indexAftermarketPartsByCarPartId` does not exclude `zoneId` SKUs the way its stock sibling does,
  so `aftermarketPartByCarPartId[class].panels` resolves to a zone panel. The one-line fix moves the
  restoration bill and market value on those cars, so it wants its own change with the
  re-derivation done honestly. This sprint closes the visible half for free: those cars no longer
  collect style points from a body they are not wearing.
- **A race widebody costs about ¥121,000 at everyday class against ¥12,500 for a race wing**, for 12
  style points against 18. Style-per-yen is an order out. That is `partPricing.baseCostYen.bodyKit`,
  a directive 22 lever, and per directive 23 its current value was not allowed to bend the design.
- `StandingScreen.vue:62` still reads *"Needs tier 3 of the tool line this operation uses"*, naming a
  tier rather than a tool. Different refusal, story-build scene gate, outside this task.

### Still blocked on signature

Tasks 6 and 7 did not start. Widebody's gate level, underglow's `style` and its `authenticityCost`.
The roll cage remains blocked on an `upper` authored on handling for daily-drivers in `buyers.json`,
without which it is a strict upgrade.
