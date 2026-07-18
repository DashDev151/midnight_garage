# Sprint 93 - The band ceiling (tools cap the finish)

The second tooling sprint implementing `docs/design/tooling-system.md` (read it first).
Delivers Axis 2 (BAND CEILING) and Axis 3 (MASTER tier). This is the real rebalance of the
three; it is probe-gated and depends on Sprint 92's uniform fee model.

## Reuse analysis (directive 16)

**New mechanisms:**

- A per-group band ceiling read by the repair planners.
- The soft-cap rule: mint work at tier-1 pays the group's Sprint-92 rental fee.
- The tier-3 "no top-band fee + master" rule.

**Existing mechanisms to reuse:**

- `repairLevelForGroup` / `slotsNeededToClimb` / `planPartRepair` / `planGroupRepair` /
  `planReconditionPart`: the ceiling is a new clamp inside these, not a new planner.
- Sprint 92's `machineShopAssist` fee model and ledger path: the mint-work rental fee IS the
  Sprint-92 fee for that group, charged when a repair targets above fine without tier-2.
- The content `minToolTier` authoring already encodes the band-tier relationship; align to
  it rather than inventing a second table.
- The coherence wage probe and the story-mission satisfiability probes: re-derived, not
  replaced.

## Decisions

1. **The ceiling.** A new content knob `economy.repairBandCeilingByTier` (default
   `{1: "fine", 2: "mint", 3: "mint"}`, per-group override allowed). The repair planners
   clamp the achievable target band to the group's tier ceiling. Tier-1 caps at fine;
   tier-2 reaches mint. Grades above the ceiling are simply not planned unless the tier-2
   capability is present (owned or rented, decision 2).
2. **Soft cap via rental.** When a repair targets a band above the tier ceiling and the
   group's tier-2 is not owned, the work is still allowed and charges the group's Sprint-92
   rental fee once for that repair (the machine session that lifts the ceiling). Never a
   wall. Charged through the existing ledger path; no double-charge with an assembly pull
   fee (the design note's charge model governs).
3. **Tier-3 master.** Tier-3 removes the mint-work rental fee a tier-2 shop would still owe
   for the top band, and remains the tier the six technique templates require (unchanged).
   Its concrete extra edge (a small margin/quality or speed perk) is chosen and balanced
   here; keep it modest and legible. Documented in the design note on landing.
4. **Content alignment.** Reconcile the handful of service-job `minToolTier` values that
   disagree with the uniform ceiling (e.g. paint-mint tasks authored at tier-3 while the
   default ceiling puts mint at tier-2): either move mint to a per-group tier-3 ceiling for
   body/paint, or align the task to tier-2. Decide per group in the design note; keep the
   count of edits minimal and record each.
5. **Re-derive the economics (the blast radius).**
   - **Wage / coherence probe:** fold the mint-work rental fee into
     `computeModelCoherence`'s rare-car restore; the wage margin must stay positive at
     tier-1 (owning widens it). Re-pin `valueModelProbes.test.ts`'s law-6 assertions.
   - **The 5 mint-band story missions:** re-derive their budget caps to include the tier-1
     rental a shop would pay, so each stays satisfiable day-one; ADD the tool-satisfiability
     check the missions lack today (verify the required band is reachable by rent-or-own
     within budget).
   - **Reachability unit tests:** `bands.test.ts` (the "same partIds at any tier" test now
     asserts tier-1 stops at fine), `restorationPacing.test.ts` (mint-at-tier-1 now includes
     rental or targets fine), the ~40 mint-target `jobs.test.ts` cases (tier bumped or fee
     asserted). Directive 17: each is case (a) - the implementation redefines what is
     correct; update to the new contract and state so.
6. **Save.** A schema change only if the ceiling knob needs persisting (it is content, so
   likely not); one Dexie bump if any persisted shape changes, no migration (directive 19).

## Definition of done

- [ ] Tier-1 repairs cap at fine; tier-2 reaches mint; the ceiling is a content knob.
- [ ] Mint work at tier-1 is possible via the group's rental fee (soft cap), charged once,
      no double-billing; owning tier-2 removes it.
- [ ] Tier-3 removes the top-band fee and keeps the master-template role; its extra perk is
      defined and balanced.
- [ ] The wage probe stays positive at tier-1 with rental folded in; the 5 mint-missions
      stay satisfiable day-one with a real tool-satisfiability check; reachability tests
      re-derived (directive 17 cases stated).
- [ ] Three package typechecks clean; narrowest tests once; pre-push gate is the evidence.

## Task breakdown

**Claude-implementable:** all; the per-group ceiling and tier-3 perk are orchestrator design
calls made during the sprint. **User-only:** none beyond the standing playtest.

## Exit

(Filled at sprint close.)
