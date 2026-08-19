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
| **A repair click that resumes an open job silently ignores its own target band.** `findOrCreateJob` keys on car+kind+component (`jobs.ts:909`) and a resume returns the open job unchanged (`jobs.ts:1278`), so a "to mint" click that lands while the fine job is still open spends labour finishing FINE and never creates the mint job. Billing is honest; the delivered band is not what the button said. | day-6 playtest: chassis "to mint" click, 8 labour, car sold with chassis at fine | real fix needed in the repair control: show "resuming: to {band}" when an open job exists, or retarget the job on resume. Found alongside the sprint 220 body-shop rebuild but it is workbench repair, not body pipeline |

---

## B. Waiting on a maintainer number

Nothing here can be built without a value, and directive 22 means guessing is not an option.

**Five of the six rows that were here are now closed. Struck 2026-08-13; sprint 197 answered all
five, three by signing a value and two by arguing the number should not move:**

| closed lever | how it closed |
| --- | --- |
| `machining.valuePremiumPerOperation` | **signed at 0.08.** At 0.03 a full engine's machining returned less than a day's labour was worth |
| underglow `style` / `authenticityCost` | **signed at 6 / 0.3** |
| roll cage: `upper` on handling for daily-drivers | **signed at 0.60.** Measured: 0 of 48 shipped cars cross it stock, 24 of 48 do once built, and 20 of those lose `delighted` with a daily-drivers buyer. 0.55 would have tripped a bone-stock NSX-R, which is why it is not 0.55 |
| race body panel mass | **held at 0.975, deliberately.** It reads 0.238s at Hakone, louder than predicted, but 25 to 35 kg on a 1,200 kg car genuinely is 2.5 per cent. The number is physically honest; the expectation was the imprecise part |
| `partPricing.baseCostYen.bodyKit` | **held, deliberately.** The style-per-yen argument that raised it stopped holding at sprint 192, when body panels began carrying market value through `installedPartsValueYen` and race panels began saving mass. The shell buys three things now, the wing buys one |

**Still genuinely open, and the only row left:**

| lever | proposed | state |
| --- | --- | --- |
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
