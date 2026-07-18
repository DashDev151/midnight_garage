# Sprint 93 - The band ceiling (tools cap the finish)

The second tooling sprint implementing `docs/design/tooling-system.md` (read it first).
Delivers Axis 2 (BAND CEILING). Maintainer ruling 2026-07-18 corrected the model: the band
ceiling is a HARD cap on REPAIRING, not a soft rental. It is probe-gated.

## The corrected model (maintainer ruling 2026-07-18)

- **Repairing a part up to mint requires OWNING that group's tier-2 machine.** Tier-1 can
  repair a part only up to FINE. There is NO rental for the mint band: tier-2 must be bought.
- **This gates REPAIR only, never INSTALL.** Buying a mint replacement part and fitting it is
  always allowed at any tier (it is an install, not a repair). So a mint result is ALWAYS
  reachable by buying the part; owning tier-2 only lets you REPAIR the existing part to mint
  instead of buying a new one (cheaper, keeps a genuine-period part).
- **Tier-3's advantage is speed** (fewer labour slots per repair, already live via
  `repairLevelForGroup`) plus being the tier the six master-craft technique contracts
  require. No new perk in v1. (Sprint 94 reframes "speed" onto the energy bar.)
- Sprint 92's rental fees are for ACCESS ops only (engine pull, tyre fit, etc.), unchanged.
  There is no band-related rental fee.

## Reuse analysis (directive 16)

**New mechanisms:** a per-group repair-band ceiling read by the repair planners (a hard
clamp). Nothing else.

**Existing mechanisms to reuse:**

- `repairLevelForGroup` / `slotsNeededToClimb` / `planPartRepair` / `planGroupRepair` /
  `planReconditionPart`: the ceiling is a new clamp INSIDE these; tier still sets speed.
- The buy+install path (`resolveBuyPart` always yields mint; install has no tier gate): this
  is the untouched mint route for a tier-1 shop, and the reason the cap is never a wall.
- The coherence wage probe and story-mission satisfiability probes: re-derived, not replaced.

## Decisions

1. **The ceiling (hard).** New content knob `economy.repairBandCeilingByTier`
   (`{1: "fine", 2: "mint", 3: "mint"}`, uniform; per-group override allowed but unused in
   v1). The repair planners clamp the achievable REPAIR target band to the group's tier
   ceiling: at tier-1, a repair can climb a part only to fine; grades above fine are not
   planned. INSTALL/replace of a bought part is untouched (a bought part is already mint).
2. **The mint route at tier-1 is buy-and-fit, always available.** No rental, no fee for the
   band. A tier-1 shop that wants a mint part buys a replacement and installs it (existing
   path, unchanged). Owning tier-2 lets you repair the existing part to mint instead: cheaper
   than buying, and it keeps a genuine-period part. That price gap IS the incentive to own.
3. **Tier-3 = speed + master contracts, unchanged.** No new mechanic. `repairLevelForGroup`
   already makes tier-3 the fastest (fewest labour slots per grade); the six technique
   templates already require tier-3 to accept. That is its "different advantage".
4. **Content alignment.** The mint-band service-job tasks already carry `minToolTier: 2/3`
   (the OWN-to-accept gate); these stay. Confirm the repair ceiling (mint == tier-2) does not
   contradict any authored task; where a task's paint-mint sits at tier-3, that is the
   own-to-accept gate and is left as-is (repairing to mint needs tier-2 owned; the contract
   needs tier-3 owned; owning tier-3 satisfies both). Record any edit; expect few or none.
5. **Re-derive the economics (the blast radius).**
   - **Wage / coherence probe:** `computeModelCoherence` plans rare cars to their mint
     expectation at tier-1 today. Under the cap, tier-1 cannot REPAIR above fine, so the
     above-fine portion must be reached by BUYING mint parts. Re-derive the rare-car restore
     cost to use buy+install for the above-fine grades at tier-1 (repair-to-fine + buy-to-
     mint), and assert the wage margin stays positive (owning tier-2 lets you repair instead
     of buy, widening it). Re-pin `valueModelProbes.test.ts`'s law-6 assertions.
   - **The 5 mint-band story missions:** still satisfiable at any tier via buy+install of
     mint parts. Re-derive their probe cost to reflect the buy-to-mint path where a tier-1
     shop would use it, and ADD the tool-satisfiability note (the required band is always
     reachable by buying parts, so no mission is ever tool-locked; the cap only changes
     COST, never possibility).
   - **Reachability unit tests:** `bands.test.ts` (the "same partIds at any tier" repair
     test now asserts tier-1 repair stops at fine), `restorationPacing.test.ts`
     (repair-to-mint at tier-1 now caps at fine or uses buy+install), the ~40 mint-target
     `jobs.test.ts` REPAIR cases (bump the tier to 2, or assert the tier-1 refusal-above-fine
     and the buy+install alternative). Directive 17 case (a) throughout; state each.
6. **Save.** Content-only (the ceiling knob); no persisted shape change, no Dexie bump.

## Definition of done

- [x] Tier-1 REPAIR caps at fine; tier-2 repairs to mint; the ceiling is a content knob;
      INSTALL of a bought (mint) part is unaffected at any tier. The on-car "+" now stops at
      the ceiling (no phantom mint rung that fails at Confirm).
- [x] A tier-1 shop reaches mint only by buying+fitting a part; owning tier-2 lets it repair
      to mint instead. No band rental, no band fee.
- [x] Tier-3 stays speed + master-contract access; no new mechanic.
- [x] Wage probe positive at tier-1 (sensible play repairs to fine, not a loss-making
      buy-to-mint); the 5 mint-missions stay satisfiable at any tier; reachability tests
      re-derived (directive 17).
- [x] The tier-1 repair cap is legible: the "+" affordance carries the swept caption naming
      the group's tier-2 machine.
- [x] Three package typechecks clean; narrowest tests once; pre-push gate is the evidence.

## Task breakdown

**Claude-implementable:** all; the per-group ceiling and tier-3 perk are orchestrator design
calls made during the sprint. **User-only:** none beyond the standing playtest.

## Exit

Landed (implementation by subagent, orchestrator-policed). The record:

- **The hard cap.** `economy.repairBandCeilingByTier` ({1:fine, 2:mint, 3:mint}) clamps every
  repair planner; `repairJobGate` refuses an on-car repair above the tier ceiling
  (`tool-tier` reason, no new enum). Tier-1 repairs to fine; tier-2 owned repairs to mint.
  Install/replace of a bought part is untouched (a bought part is already mint), so mint is
  never tool-locked, only cheaper to reach if you own the machine. The on-car repair "+" now
  stops at the ceiling too (previously it offered a mint rung the sim refused at Confirm - a
  silent stop, now closed).
- **The buy-to-mint economics, corrected from the numbers.** The spec assumed a tier-1 shop
  would buy mint parts to finish a rare car. The real pricing shows that is a per-part LOSS (a
  mint stock part costs ~1.0x its price; the worn-to-mint value gain is only ~0.22x). So the
  sensible tier-1 play is repair-to-fine-and-sell; owning tier-2 lets you repair to mint
  cheaply, widening the rare-car margin by ~215k (mintFlip 860k vs sensibleFlip 645k). This is
  a crisper tier-2 incentive than the spec's, grounded in real data, and it means restoring a
  rare car to concours for a flip now REQUIRES owning tier-2. Wage margin stays strongly
  positive at tier-1 (+247,810 on the rare rows); all 28 law-6 assertions held (inequality
  based, no exact re-pin).
- **Mint missions stay satisfiable at any tier** (buy+install performance parts to hit the
  stat/lap thresholds - the normal path, unpriced by the band cap); a new probe proves they
  can never be tool-locked. Budget==payout (Sprint 91 one-price) preserved.
- **Directive 17, all case (a):** 14 tier-1 tests that climbed to mint via the "+" retargeted
  to the reachable fine (intent preserved, none weakened); the schema top-key pin gained the
  new knob; the "reaches mint at any tier" band test recast.
- **One golden moved, verified pure value:** advanceDay 30-day career (7a2e3325 to d997e784),
  because the scripted day-1 body repair now finishes at fine not mint (one grade less cash).
  No state-shape change, determinism intact via the repeat-run test. Re-pinned with a comment.
- **Legibility:** the "+" affordance shows "Your tools finish at fine. The {machine} reaches
  mint." at tier-1 (the group's tier-2 machine name interpolated), gone at tier-2.
- **Pre-existing quirk surfaced, logged not fixed:** `chassis` is in the `drivetrain` group,
  so its caption names the "Transmission bench" - nonsensical. Pre-existing grouping wart,
  TODO.md carries it for a content-taxonomy pass (moving it ripples through everything that
  groups by component).
- **No save change** (content-only knob).
- **Narrow evidence:** sim 51 files / 965 tests; content 10 / 88; game 47 files / 553; all
  three package typechecks exit 0.
- **Full evidence:** pushed through the pre-push gate; no separate manual pass (directive 20).
