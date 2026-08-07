# Sprint 193: the backlog, triaged

**Status: TRIAGE, not a work order.** Nothing here is scheduled. This exists because six sprints
landed in one day and left a tail of measured findings that will be worthless in a month once the
context is gone.

**`TODO.md` remains the permanent home for anything without a sprint number.** This doc does not
duplicate it: it says which items are cheap, which are real work, and which block others. Where an
item has a full write-up in `TODO.md` or a sprint Exit, this points at it rather than restating it.

---

## A. Live defects, measured, with numbers attached

These are wrong in the shipped game right now. Each has its measurement recorded, which is the thing
that decays if it sits.

| defect | measured | size |
| --- | --- | --- |
| **Zone panels are fitted as whole bodyshells at generation.** `indexAftermarketPartsByCarPartId` does not exclude `zoneId` SKUs the way its stock sibling does, so `aftermarketPartByCarPartId[class].bodywork` resolves to a zone panel. | **32 of 600 generated lots (5.3%)** are born wearing something like a skirt kit as their entire body | small fix, but it **moves the restoration bill and market value** on those cars, so it needs its own change with the re-derivation done honestly |
| **The Facilities cards' "Fully equipped" label is invisible in the running app.** A second `.maxed` rule in `UpgradesScreen.vue` sets `visibility: hidden` unless `.shown`. | always, whenever a bay type maxes out | trivial |
| **`statWeights.authenticity` disagreement.** Content sums to **99 across 28 slots**; `carstats/authenticity.md`, `machining-sku-scoping.md` and `desirability-system.md` all state 29 slots summing to 100. | pre-existing, predates the zone work | docs only, but pick a side and make the docs match content |
| **The pre-push gate flaked once and could not be diagnosed.** Two tests in one unnamed file; the hook truncated its output before the failure block. Two clean runs after. | once | **nothing was changed to make it pass.** Capture the failure block first if it recurs; `TODO.md` has the instructions |

---

## B. Waiting on a maintainer number

Nothing here can be built without a value, and directive 22 means guessing is not an option.

| lever | proposed | state |
| --- | --- | --- |
| `machining.valuePremiumPerOperation` | **0.03 to 0.08** | prelim approved until playtest. At 0.03 a full engine's machining returns less than a day's labour is worth |
| underglow `style` / `authenticityCost` | **6 / 0.3** | prelim approved until playtest. 6 sits just above show fitment's 5; 0.3 between corner weighting and show fitment |
| race body panel mass | shipped at **0.975** | shipped, but it reads **0.238s at Hakone**, louder than the sprint doc predicted. **0.994 would give about 0.06s** if that is too much |
| `partPricing.baseCostYen.bodyKit` | unchanged | a race body costs about **¥121,000** against **¥12,500** for a race wing, for 12 style points against 18. Style-per-yen is an order out |
| roll cage: `upper` on handling for daily-drivers | none proposed | **this one blocks the feature entirely.** A cage cannot add mass (schema refuses it) and costs about one authenticity point, so without an `upper` it ships as a strict upgrade, which is the opposite of the design |
| reputation floor on a tool purchase | keep for now | deferred by the maintainer; `TODO.md` records the question |

---

## C. Investigations that must run before their design can start

Each is blocked on an answer, not on a decision.

**Contact patch.** Splitting mechanical grip so tyre WIDTH is separable from COMPOUND. This is what
makes wide bodywork a prerequisite worth having, which is the best idea currently on the table. Until
it is answered, sport and race body panels remain cosmetic.

**Aero as a system.** Today it is one slot with one `byGrade` table, so a splitter, a diffuser, a
set of canards and a GT wing are the same object. Real aero is several parts that interact. The
locked performance model carries a single `downforceCoeff`, so this reaches into the model.

**The chassis shop's content.** Still no honest proposal. A dog box needs a gear-shift term the
model does not have, and faking it with `powerFraction` on `gearbox` would lie about what the part
does. The maintainer has agreed the model should not grow to accommodate it, so the shop needs
something the model can already express.

---

## D. Deferred structure, from the DRY sweep

Real wins, no correctness stake, ordered by payoff over risk. None blocks anything else.

1. **`gameStore.types.ts`** - 905 lines of type declarations with zero coupling, a 17 per cent cut
   to a 5,462-line file. Mechanical.
2. **`jobEngine.ts`** - kills two of the three import cycles, which all pass through the same three
   symbols.
3. **`machineLine.ts`** - frees `assemblies` and `stagedWork` from importing 1,482 lines to reach a
   facility predicate.
4. **Drop `balanceProbes` from the public barrel** - a test instrument on the shipped surface. One
   line.
5. **`BackLink.vue`** - the same computed, markup and CSS rule copy-pasted into 20 files.
6. **`formatPercent.ts`** - four competing implementations, and two different unit words (`per cent`
   and `%`) on adjacent screens.
7. **`gateCopy.ts`** - `'Not enough cash'` in seven places across three files.
8. **`CarDetailScreen.vue`** - 3,088 lines. The docked action panel (441 lines) is three unrelated
   panels sharing one section. **Do NOT extract `PartActionPanel`**: `dropZones` is deliberately
   built once across all part ids for stable pointer identity.
9. **`TutorialOverlay.vue`** - 436 lines of pure decision logic that cannot be tested without
   mounting.

---

## E. Open design questions the maintainer has reserved

- **Does room art become the interface?** Every rendered garage room is a backdrop; nothing in any
  of them is clickable. Whole-garage decision, and room sprints should avoid building UI it would
  throw away.
- **The machine-hire panel** is a text inventory of six named machines living on the car screen,
  where it makes least physical sense. Moving it needs the tier-2-versus-tier-3 hire inconsistency
  settled first (`bodyLineCapability` treats a hire as granting the whole line; nothing else does).
- **The Spoon premium**, reopened. The old ruling against a seller multiplier predates the current
  value model.
- **The race parts shop.** Scarcity as the gate rather than tools. Full write-up in `TODO.md`.
- **The four repair-or-replace planners.** Confirmed as real refactoring by the maintainer. They
  disagree on labour deliberately, so the shared thing is the per-part decision and the two price
  atoms, not the loop.

---

## F. Older, already in `TODO.md`, not re-narrated here

The break-even sweep across every money sink; generation letting age override care so a cherished
classic arrives a wreck; every kei generating as a wreck; the Import Broker and the five held-back
gaisha cars; the bot harness rework; the roster's thin bottom end; the nine stand-in car prices.

---

## Exit

*(This doc has no Exit. It is triage, and it is done when its items are.)*
