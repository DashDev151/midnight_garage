# Sprint 33: Playtest response - legibility, early-game gating, and calibration

*Source: maintainer's second playtest, 2026-07-12 (notes captured live). The auction findings
from that same playtest are handled separately (the committed auction fix + the live-auction
investigation in `TODO.md`); this sprint is everything else that playtest surfaced. Read
`CLAUDE.md` in full first; no em dashes anywhere.*

## Why this sprint exists

The stock-baseline/catalog build (Sprint 32) is mechanically sound but the first real play session
found it illegible and mis-paced in several concrete ways: permanent tutorial text clutters the
main screens, the job board offers work the player physically cannot do, the parts catalog is one
unusable flat list, the auction condition report is unreadable, the parts inventory hides the one
thing that matters (condition), cars generate in absurd condition for their age, and the labor
economy is wildly out of step with the 29-part repair granularity. None of this is a new system;
it is making the systems that exist legible and correctly paced for a real player.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (nothing here is a new system):**

- The Sprint 28 drill-down / `BandChip` / `PartCard` / `ReplaceDrawer` / screen components:
  polished and re-laid-out, not rebuilt. The catalog hierarchy and the auction condition report
  are new *layouts* over existing data.
- Sprint 29's service-job tier gating + the Sprint 13 equipment gate + the equipment-hint
  mechanic: the job-availability rules extend these, they do not fork a second gate (Sprint 08's
  one-system rule).
- The generation condition roll (`auctions.ts` / `newGame.ts`, the `CAR_CONDITION_*` constants +
  `bandForMigratedCondition`): recalibrated, not replaced. Age is available at generation (the
  tag-gating `currentYear` is still threaded; only its VALUE use was removed).
- The labor-slot economy + the 3-tier repair-level formula (Sprint 26 `bands.ts`): recalibrated
  numbers, same mechanic.
- The per-instance `PartInstance.band`: already exists, just surfaced in the inventory UI.

**Genuinely new (small):**

- A click-through catalog hierarchy (pure UI state: group -> sub-part).
- A restructured, legible auction condition report layout.
- A tutorial-phase gate on equipment purchases and job offers (a thin new precondition on top of
  the existing reputation-tier gate, not a parallel system).
- An age-aware (or tier-aware) input to the generation condition roll.

**Explicitly NOT in this sprint:** the in-inventory part-recondition mechanic (maintainer flagged
it as a future addition, `TODO.md`); the live-auction redesign (its own investigation); any final
number-tuning that genuinely needs more play data than one session (condition + labor land a
sensible first pass here, calibrated further in playtest).

## Design decisions (locked, and TWO that need a maintainer call first)

1. **UI declutter (note 1).** Persistent tutorial/explainer text ("drag a car onto another slot...",
   "Owning a component's equipment is what unlocks Repair...") comes off the main gameplay screens.
   One-off/dismissible tips or a help affordance, never permanent chrome. Audit every screen.
2. **Job board only shows actionable work (note 2).** A service-job offer appears only if the
   player can complete it NOW, or needs exactly ONE equipment purchase (surfaced as a buy-this
   hint). Equipment itself tiers: nothing purchasable during the tutorial phase, then the Tyre
   Machine & Balancer, then the rest gated behind reputation as today. Early-game offers are
   predominantly Replace-only (no equipment) with a few single-equipment-hint jobs. Extends Sprint
   29 tier gating + the equipment-hint mechanic; no turbo/late-game job on a fresh game.
3. **Parts catalog is a drill-down (note 3).** Main group -> sub-part hierarchy, not one flat list.
   Keep it lightweight; reuse the group/part vocabulary already in the taxonomy.
4. **Auction condition report is restructured for legibility (note 4).** The 29-part grid becomes a
   readable, scannable layout (grouped, aligned), reusing `BandChip` and the same per-part rows the
   owned-car page uses.
5. **Parts inventory shows condition (note 5a/5b).** Every `PartInstance` card shows its band, in
   the inventory screen AND the replace drawer; the drawer also gets a visual polish. (The
   recondition-a-part mechanic, note 5c, is deferred, see "not in this sprint".)
6. **Generation condition is age/tier-aware (note 6/S14).** A ~2-year-old car must not roll nearly
   every part `poor`. The condition baseline skews toward better for younger and/or higher-tier
   cars. First-pass curve here; final calibration in playtest. (This is generation condition, NOT
   the value model, age was correctly removed from VALUE and stays out.)
7. **Labor recalibration (note 7).** Base 2 labor slots against per-component repair makes a full
   restoration take ~20 days, far too slow. Re-calibrate labor throughput (base slots, the
   repair-level speed multiplier, and/or parts-per-slot) so restoration is paced to be fun, not a
   war of attrition. First pass here, tuned against the balance harness + playtest.

**Maintainer decisions (locked 2026-07-12):**

8. **Customer-parts ethics: the customer keeps their part.** When a Replace/Remove pulls the old
   part off a CUSTOMER's car (a service job), that part is NOT added to our inventory, it leaves
   with the customer. On an OWNED car we keep it, as today. (`resolveRemovePart`, and any replace
   path that drops a removed part to inventory, gates that drop on the car being owned.)
9. **Tutorial gate: deferred; early game handled by equipment gating for now.** No formal
   tutorial-phase system this sprint. Instead, only ONE machine (the Tyre Machine & Balancer) is
   purchasable from the start (`unknown` reputation); every other machine requires `local`+
   reputation, so a fresh game (roughly its first week) has just that one tool. The job board's
   actionable-or-one-purchase-away rule (decision 2) then follows naturally from what the player
   can actually do with that single machine plus Replace-only work.

## Definition of Done

- No permanent tutorial/help text on main gameplay screens; verified across every screen.
- Job board never offers an un-doable job on a fresh game; equipment tiers per decision 2;
  early-game jobs are predominantly Replace-only. Test: a new-game first-offers set is all
  actionable.
- Catalog drill-down works keyboard-and-pointer; auction condition report is legible; inventory +
  drawer show part condition.
- Generated cars' condition is plausible for age/tier (young cars are not near-scrap); seeded-
  deterministic; a test asserts a young car's median part condition is well above `poor`.
- Labor throughput recalibrated; a test/anchor documents "days to fully restore a typical car" is
  in a sane band.
- Customer-parts handling implemented per the maintainer's decision.
- Full gate green; balance run + invariant check re-run (generation-condition + labor changes move
  economy numbers; document as expected, not regressions); no NEW hard-invariant break beyond the
  already-deferred Sprint 32 days-to-local one.

## Tasks (Claude-implementable)

- [x] Game/UI: declutter pass (remove persistent hints, all screens); catalog drill-down; auction
  condition-report restructure; inventory + drawer part-condition display + drawer polish.
- [x] Sim/content: job-availability gate (actionable-or-one-tier-up) + equipment tutorial tiering;
  age/tier-aware generation condition; labor recalibration (constants).
- [x] Sim: customer-car removed-part handling per the maintainer's decision.
- [x] Tests per DoD (fresh-game offers all actionable; young-car condition; labor-days anchor;
  customer-parts behavior); Exit. Balance re-run left for the orchestrator (see Exit).

## User-only tasks

- [x] Make the two flagged design calls (customer-parts handling; the exact tutorial gate) - locked
  2026-07-12 as decisions 8/9 above, implemented this sprint.
- [ ] Playtest again and give final numbers for condition skew, labor throughput, and job cadence.

## Exit

**Step 0 fit-check:** the design fit the existing code with no contradictions, but implementing
decision 9 (equipment tiering) faithfully exposed two real, pre-existing structural bugs rather
than just moving numbers - both investigated and fixed, not papered over:

1. **The bot-facing `DayActions` pipeline had no way to remove a part.** The player's own Replace
   flow already required Remove-then-Replace on an occupied slot (`CarDetailScreen.vue` only shows
   Replace once a slot reads empty), but `bots/serviceJobHelpers.ts`'s `queueServiceJobTasks` never
   removed anything - it went straight to buy-then-install, which worked fine pre-Sprint-32 (every
   slot started empty) but has silently failed every bot's install-task completion since Sprint 32
   (every slot starts stock-filled). Invisible while repair-only bootstrap paths existed; decision
   9 makes install-only (Replace) work the PRIMARY early-game path for both real players and bots,
   which surfaced it immediately (`competentPolicyStrategy` went from a measured 627/1000
   days-to-`local` baseline to 0/100 in a fresh trace). Fixed with a new `removeParts` DayAction
   (`actions.ts`/`advanceDay.ts` step 0b) that `queueServiceJobTasks` now queues first when an
   install task's target slot is occupied, mirroring the player's own two-step exactly - not a new
   mechanic, just wiring the bot-facing action system up to a resolver (`resolveRemovePart`) that
   already existed for the player.
2. **`serviceGrinderStrategy`'s repair-only identity was the exact Sprint 16 catch-22, reintroduced.**
   Sprint 16 first hit this (gating all its equipment meant it could never earn the reputation
   needed to unlock any of it) and fixed it by leaving `upholstery-bench` ungated. Decision 9 closes
   that carve-out (every machine but the tire machine now needs `local`+), which reopens the same
   trap for a bot that only ever accepts repair-kind jobs. Fixed in the bot itself, not with another
   content carve-out: `isSingleDisciplineJob` now also accepts install-only job lists, matching
   decision 9's own stated intent ("the job board's actionable-or-one-purchase-away rule then
   follows naturally from what the player can actually do with that single machine plus
   Replace-only work").

Both fixes are traced, verified by measurement (below), and necessary for decision 9's own
intended bootstrap path to actually work for automated play - not scope creep.

**Files changed** (34 modified + 2 new; forbidden files - `parts.json`, `parts-taxonomy.json`,
`marketValue.ts`, `valuation.ts`, `tools/balance/**`, `CLAUDE.md` - untouched; no `GameState`
shape change, no save-schema bump):

- Content: `data/equipment.json` (+`minReputationTier: "local"` on brake-lathe/suspension-press/
  upholstery-bench - tire-machine stays ungated), `data/economy.json` (+`partsGeneration`'s two
  age-curve fields), `src/economy.ts` (`CurveSchema` exported, +`conditionBaselineMinByAgeYears`/
  `MaxByAgeYears`).
- Sim: `src/auctions.ts` (`generateAuctionCarInstance` rolls `year` before the condition baseline;
  new `conditionBaselineRangeForAge`/local `interpolateCurve`), `src/constants.ts`
  (`PLAYER_BASE_LABOR_SLOTS` 2 -> 6; `CAR_CONDITION_BASE_MIN`/`MAX` removed in favor of the content
  curves; +`DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED`), `src/serviceJobs.ts`
  (`missingEquipmentGroupCount`/`actionableOrOnePurchaseAwayTemplates` hard-filter ahead of the
  existing hint mechanic), `src/jobs.ts` (`resolveRemovePart` gates the inventory drop on the car
  being owned), `src/actions.ts` (+`removeParts` DayAction), `src/advanceDay.ts` (+step 0b resolving
  it), `src/bots/serviceJobHelpers.ts` (`queueServiceJobTasks` queues a remove when an install
  task's slot is occupied), `src/bots/serviceGrinder.ts` (`isSingleDisciplineJob`: repair-only OR
  install-only, not just repair-only).
- Game: `src/components/HelpHint.vue` (new - the shared collapsed-by-default help affordance),
  `src/components/PartCard.vue` (+`BandChip`), `src/components/ReplaceDrawer.vue` (`HelpHint` +
  header/close-button/empty-state polish), `src/screens/GarageScreen.vue`/`UpgradesScreen.vue`/
  `PartsInventoryScreen.vue`/`ServiceJobsScreen.vue`/`CarDetailScreen.vue` (permanent `<p class="how">`
  paragraphs -> `HelpHint`), `src/screens/PartsMarketScreen.vue` (group -> sub-part click-through
  drill-down, replacing the flat `<select>` component filter), `src/screens/AuctionScreen.vue`
  (condition-report ONLY: grouped `.condition-group` cards with aligned per-part rows via
  `display: contents`, reusing `BandChip` - bidding/`closeLabel`/anti-snipe logic untouched).
- Tests: `restorationPacing.test.ts` (new - the labor-days anchor), plus updated/added coverage in
  `equipment.test.ts`, `serviceJobs.test.ts` (actionable-filter + fresh-game-offers), `auctions.test.ts`
  (age-aware condition), `jobs.test.ts` (owned-vs-customer removed-part), `actions.test.ts`
  (`removeParts`), `laborSlots.test.ts`, `advanceDay.test.ts` (re-pinned hashes),
  `bots/runCareer.test.ts` (Service Grinder doc/timeout - see below), `gameStore.jobs.test.ts` (a
  pre-existing test's "take offer[0]" assumption no longer holds now that generated cars skew
  toward better condition - fixed by reusing this file's own established
  "find a still-unfinished offer" pattern, not by weakening the assertion), plus `PartCard.test.ts`/
  `AuctionScreen.test.ts`/`PartsMarketScreen.test.ts` component coverage for the UI changes.

**Equipment gating (decision 9):** tire-machine (`wheels`) stays ungated (`unknown` reputation);
brake-lathe, suspension-press, and upholstery-bench (previously ungated or `unknown`-reachable) now
require `local`; welder/transmission-bench (`local`) and engine-crane (`known`) were already gated
at or above `local` and are unchanged. A fresh game therefore has exactly one purchasable tool.

**Job-board actionable filter (decision 2):** `missingEquipmentGroupCount` counts the DISTINCT
component groups a template's repair tasks still need equipment for, given what's owned (install
tasks never count - replace never needs equipment). `actionableOrOnePurchaseAwayTemplates` hard-
excludes anything needing 2+ groups from the generation candidate pool entirely (not merely
de-weighted) - the existing Sprint 16 `JOB_HINT_OFFER_CHANCE` reroll then decides how OFTEN a
1-missing template surfaces among what's left, unchanged in shape. Verified: a fresh game's offers
across 300 seeds never exceed 1 missing group, and skew >50% install-only (measured, not asserted
on faith - see `serviceJobs.test.ts`).

**Generation-condition curve (decision 6):** `economy.json`'s `partsGeneration.conditionBaselineMinByAgeYears`/
`MaxByAgeYears` replace the flat `CAR_CONDITION_BASE_MIN`/`MAX` (30-90 regardless of age) with two
age-keyed piecewise-linear curves: age 0 rolls baseline range [55, 98], converging back to
[30, 90] (the old flat range) by age 20+ - a genuinely old classic still rolls the original spread,
only young/recently-built cars skew better. `generateAuctionCarInstance` now rolls `year` FIRST (it
used to roll last) so `currentYear - year` is known before the baseline draw; a caller with no
calendar context (`currentYear` omitted, `Infinity`) falls back to a fixed
`DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED = 10` rather than an undefined age - real gameplay
always threads a concrete `currentGameYear(...)`, so this only matters for test/harness callers.
This is generation condition only; `marketValueYen` was not touched and still has no age term.

**Labor recalibration (decision 7):** `PLAYER_BASE_LABOR_SLOTS` 2 -> 6 (3x), the repair-level
ladder (equipment still doubles/triples effective throughput on top of this) left untouched so
equipment purchases keep their relative value. `restorationPacing.test.ts` anchors this against
real content (not RNG): a typical worn used car, base hand tools only, restores in 3-15 days
(was ~20+); a mostly-poor rough car stays under 20 days; owning the full equipment roster measurably
speeds up the same restoration. First-pass numbers, openly re-tunable.

**Customer-parts handling (decision 8):** `resolveRemovePart` now branches on whether
`carInstanceId` resolves to an owned car (part kept, unchanged from Sprint 32) or a service-job
customer's car (part discarded, never added to `partInventory`) - the only other code path that
ever dropped a removed part into inventory (grep-verified: `parts.ts`'s two `partInventory` writes
are both buy-flows, unrelated).

**Golden hashes re-pinned** (`advanceDay.test.ts`, by running and reading real output - decision 6's
generation reorder shifts every generated car's condition, and therefore every downstream RNG draw
and price, for the rest of each career):

- scripted 30-day career: `8c5a4388` -> `9dfc95d8`
- acquisition-and-sale path: `085ca712` -> `6dfec42b`

**Service Grinder bootstrap, re-measured** (`bots/runCareer.test.ts`'s own doc comment carries the
full numbers): the install-only bootstrap path this sprint adds is measurably BETTER than the old
repair-only one it replaces - n=200 -> 172/200 (86%) vs. Sprint 22's 116/200 (58%) on the same
metric. That test's 200-seed loop needed an explicit 20s timeout (`pnpm test` runs it in ~1.4s;
`pnpm test:coverage`'s v8 instrumentation overhead alone pushes it past vitest's 5s default) - a
real wall-clock budget for a legitimately heavier test, not a loosened assertion.

**Final gate (all shown, all green):**

- `pnpm typecheck` - `content`/`sim`/`game` (`vue-tsc`) all `Done`, zero errors.
- `pnpm lint` - zero errors (one `vue/no-template-shadow` warning fixed along the way - a
  `v-for` loop variable name collision in `AuctionScreen.vue`'s new condition-report markup).
- `pnpm format` - clean after `format:fix` (whitespace/wrapping only).
- `pnpm test` - **70 files, 755 tests, all passing.**
- `pnpm test:coverage` - all 755 tests passing; thresholds (80/65/78/82) cleared at
  88.44%/77.5%/89.84%/92.51% statements/branches/functions/lines.

**Left for the orchestrator:**

- **Balance re-run required, not performed here per the sprint's own scope boundary.** Every lever
  Sprint 33 touches moves harness numbers by design: the condition-generation curve (decision 6),
  labor throughput (decision 7), equipment tiering (decision 9), and the job-board filter (decision
  2) all shift when/how bots earn reputation and cash. The days-to-`local` hard invariant
  (already FAILING pre-Sprint-33 per `TODO.md`, deliberately left failing rather than silently
  retuned) needs a fresh harness run against this full diff before it can be re-assessed - not a
  re-derivation of the pre-Sprint-33 numbers, since the mechanism underneath it changed materially
  in more than one place at once.
- **Design question, not a bug:** decision 6 was implemented as purely age-aware (the "or
  tier-aware" alternative the reuse analysis allowed was not built) - a young car of any rarity
  tier gets the same condition-baseline boost. If tier should ALSO skew condition (a rare/legend
  car being better-kept independent of age), that is a follow-up, not implied by what shipped here.
- **`SaveMenu.vue`'s save-code-backup nudge was deliberately left alone**, not converted to a
  `HelpHint`: it only ever renders behind an explicit player click (the Save panel toggle), so it
  was already the "help affordance, not permanent chrome" decision 1 asks for, just via a different
  existing mechanism - nesting it behind a SECOND click inside an already-opened panel would reduce
  usability for genuinely important backup-safety copy, not improve it.
- User-only: playtest again and hand back final numbers for condition skew, labor throughput, and
  job cadence (per this sprint's own DoD/user-only task).
