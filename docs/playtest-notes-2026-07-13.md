# Playtest notes - 2026-07-13 (maintainer, new game start)

Raw notes as dumped, lightly numbered. Triage produced Sprints 40-43 (see `docs/sprints/sprint40.md`
onward). Maintainer design decisions taken 2026-07-13 during triage are recorded at the bottom.

1. We need a temporary "main menu" and to move the New Game button there, along with the usual
   Continue, Load Game, Settings etc.
2. BUG: accepted a job, the car has not even made it to the workshop yet, but it is already showing
   "work done - hand back". The work reads as done before the car was ever received or seen.
3. The full-condition view is still very messy and difficult to read. Bigger issue: we are claiming
   that restoring every part to mint on a ~70k car costs almost a million yen. The balance being off
   is understood, but that is just ridiculous - this needs actual thought, not a nudge.
4. Job tasks and car conditions appear to be rolled entirely separately, producing nonsense like
   "repair this part" on a part that does not need repair. These need to be linked by design.
5. Trying to repair worn tyres to Fine, but the only option offered is repair to MINT. There is a
   "Repair all to fine" button at group level but each specific component is repair-to-mint only.
   The player should have granular control over how far to repair. Extremely sloppy as-is.
6. Rethink repair vs replace: does it make sense to repair everything, or should some things only
   ever be replaced? You cannot repair a worn tyre back to mint - you buy new ones. Same for brake
   pads.
7. Cars bought at auction need a financial summary on the car page: purchase price, repair costs,
   part upgrades, total spent, current projected value, projected profit, and the sale action. The
   buy-repair-upgrade-sell loop needs to be more visceral and visible - see the value rise with
   every action.
8. Upgrades need a clearer tech tree: a flow diagram per branch with an info box per upgrade
   explaining what it unlocks. Also: reputation gates were removed from machinery but kept on
   facilities - machinery purchases need some reputation gating too.

## Investigation findings (same day)

- Items 2+4 are one defect plus a display gap: offer generation never validates tasks against the
  rolled customer car (`isServiceTaskDone` is not called at generation), so repair tasks can be
  vacuously satisfied (slot already at/above target, rolled scrap, or rolled missing); and the jobs
  board renders "work done - hand back" with no in-transit gating (the car page gates correctly).
  The sim-side completion resolver also has no in-transit guard (latent, currently unreachable).
- Item 5 is purely UI: the sim, schemas, and store are fully generic over target bands; the
  mint/fine limits are three hardcoded literals (CarDetailScreen.vue x2, PartCard.vue).
- Item 3, quantified: full to-mint bill is Y1,048,000 on a uniformly worn car (Y1,572,000 poor)
  against a roster spanning Y180k-Y4.2M book. No car has a ~70k book value; the "70k car" is the
  value formula flooring (clean value minus 1.2x the full bill, floored at 10% of clean) collapsing
  any cheap worn car to its floor. Root cause is structural: every yen input (step costs, stock
  replacement prices) is flat across a 23x car-value range.
- Item 8: cash-only tool upgrades was a deliberate progression-bible law with a test asserting no
  rep hint exists; adding gates is a bible amendment, decided below. The tech-tree info content is
  fully derivable from existing data (template minToolTier via the carPartId-to-group taxonomy,
  plus the NA-to-turbo toolCeiling).
- Item 7: nothing financial is persisted today (no purchase price on CarInstance, no price on
  PartInstance, repair charges logged without schema-sanctioned amounts), so the ledger is a
  save-schema feature. Side-find: New Game sits on the garage screen with no confirmation and
  autosave overwrites on every state change - a one-click career-loss footgun the main menu fixes.

## Maintainer decisions (2026-07-13)

1. **Tool gating:** tiers 2 AND 3 of every tool line gain reputation gates (full mirror of the
   facilities model). This amends the progression bible's "cash is the only gate on capability" law.
2. **Sale price:** no price control on walk-in selling. Offers stay rolled around buyer valuations;
   the financial ledger provides the profit feedback. (Asking-price/minimum-offer ideas parked.)
3. **Restoration costs:** tier-scaled repair costs (per-car-tier multiplier map in content applied
   to repair step costs; replacement prices stay flat; value formula retuned).
4. **Replace-only consumables:** tyres, brakePadsDiscs, clutch become replace-only (cannot be
   repaired, only replaced).

Triage mapping: Sprint 40 = items 1, 2, 4, 5. Sprint 41 = items 3, 6. Sprint 42 = item 7.
Sprint 43 = item 8.
