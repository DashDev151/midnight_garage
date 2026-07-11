# Sprint 27: Transparent value: cost-weighted pricing and pre-bid condition visibility

*Source: maintainer playtest 2026-07-11 (`docs/playtest-notes-2026-07-11.md`, notes 6, 7, 8,
15) and the maintainer's 2026-07-11 follow-up decisions: the hidden-defect/inspection
information game is paused (removed in Sprint 26; it may return only with a genuinely better
design), and car value must weight by component cost. Status: **designed, ready to
implement.** Depends on Sprint 26. Single Sonnet implementation agent: read `CLAUDE.md` in
full first; no em dashes anywhere.*

## Why this sprint exists

Before this arc, the player NEVER saw a specific car's actual condition before buying it: the
lot card showed a static book value, mileage that fed nothing, and a vague model-level risk
hint; inspection revealed only the parallel "issues" list, not conditions. With that system
paused and deleted (Sprint 26), this sprint gives the game a single honest information
surface: what is this car worth, and how do I know, before I bid. Two pieces:

1. **Value = clean value minus the restoration bill.** This is how real buyers price a used
   car, and it is cost-weighted by construction (maintainer directive): two otherwise
   identical cars, one with a scrap turbo and one with scrap brakes, differ in value by
   exactly the difference in what it costs to put each right.
2. **The player sees true bands pre-bid, always, for free.** No fees, no reveals, no
   estimates. Bots read the same information. Nothing about a car is hidden anywhere in the
   game after this sprint.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- Sprint 26's band model, `costToMint(part)` (band steps x per-step cost), and the
  cost-weighted shim it replaces: the deduction formula below consumes the same atoms.
- `marketValueYen`'s call sites and the heat-applies-once law (Sprint 21 decision 6): heat
  still multiplies exactly once, inside clean value.
- `installedPartsValueYen` (parts retention math) for aftermarket-part value contribution.
- `valuateCarForBuyer` and the buyer taste multiplier: unchanged shape on top of the new
  base value.
- The lot detail layout and Sprint 24's meter-line row pattern for the parts list.
- The balance harness auction telemetry for recalibration.

**Genuinely new mechanisms:**

- The restoration-bill deduction valuation (one formula, replaces the shim's weighted mean).
- The pre-bid condition surface: group band chips on the lot card, a read-only 29-part band
  list on the lot detail.
- Bot bidding re-based on transparent value net of restoration bill.

**Not in this sprint (explicitly):** any estimate/optimism/reveal mechanic (paused feature),
severity labels (minor/serious/severe die with the findings system; a repair is just its
visible cost), age/mileage value factors (Sprint 30 adds them inside clean value).

## Design decisions (locked)

1. **The formula:**
   `instanceValue = max(floor, cleanValue - hassleFactor * restorationBill) + installedPartsValueYen`
   where `cleanValue = model.bookValueYen * (heatPercent / 100)` (age/mileage join in Sprint
   30), `restorationBill = sum over parts of costToMint(part)` (unfitted FI contributes
   zero, since an NA car is not "missing" a turbo; a scrap part prices at its
   `stockReplacementPriceYen` per Sprint 26 decision 5, not a repair estimate, since scrap
   has no repair path), `hassleFactor` tunable (propose 1.2: buyers
   discount more than the raw bill, absorbing the old 1.3 issue-penalty intent), `floor =
   0.1 * cleanValue`. `model.bookValueYen` remains internal-only (never displayed, per
   Sprint 25).
2. **Everything prices off it:** auction anchor (reserve, buy-now, rival walk-aways until
   Sprint 30 refines them), walk-in offers, listing prices while listings still exist, bot
   decisions. `conditionFactor` and the Sprint 26 shim are deleted; grep-clean.
3. **Pre-bid visibility (answers "when does the player see condition?"): always.** The lot
   card shows the 6 group bands as compact chips next to mileage. Opening the lot shows the
   full 29-part band list (read-only, same row component the owned-car page will reuse in
   Sprint 28) plus the computed restoration bill at the player's CURRENT repair step costs.
   The player and the bots see identical information.
4. **Bots re-based:** bidding caps derive from `instanceValue` (their private walk-aways
   spread around it); the deleted `lot.inspected` gates (stripped in Sprint 26) are replaced
   by real value logic, not restored. cautiousRestorer's identity shifts from
   "inspects first" to "only buys cars whose restoration bill is small relative to clean
   value"; competentPolicy buys positive-margin lots outright.
5. **Test the maintainer's case verbatim:** two generated cars identical except one has
   scrap forcedInduction (fitted) and the other scrap brakePadsDiscs must differ in
   `instanceValue` by `hassleFactor * (stockReplacementPriceYen(FI) -
   stockReplacementPriceYen(brakePadsDiscs))`, FI being the costlier by content (both prices
   coming from Sprint 26's taxonomy fields, since scrap has no repair-step cost to draw on).

## Definition of Done

- Deduction valuation live everywhere with the old paths deleted; all tunables in content.
- Lot card chips + lot detail parts list + restoration bill implemented; no condition
  information anywhere in the game is hidden from the player.
- Bots re-based; balance run + invariant check re-run (buyout-share and pacing invariants
  re-tuned against the new value base); deltas documented in Exit, not called regressions.
- Tests: the decision-5 case, floor behavior, unfitted-FI neutrality, heat-once invariant,
  buyer-taste bounds on top of the new base, seeded determinism of everything displayed.
- Full gate green.

## Tasks (Claude-implementable)

- [ ] Sim: `instanceValue` + `restorationBill`, rewire every valuation call site, delete
  `conditionFactor` and the shim, re-base bots.
- [ ] Content: `hassleFactor`, floor fraction, walk-away spread tunables.
- [ ] Game: lot-card band chips, lot-detail parts list + restoration bill line.
- [ ] Balance re-run + invariant retune; tests per DoD; Exit.

## User-only tasks

- [ ] Playtest an auction with the new surface: is the parts list + bill enough information
  to bid confidently? (This is the transparency baseline any future information-game design
  must beat before the paused inspection feature is reconsidered; see `TODO.md`.)

## Exit

*(Filled at implementation.)*
