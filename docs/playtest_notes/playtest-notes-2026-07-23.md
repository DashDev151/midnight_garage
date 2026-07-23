# Playtest notes, 2026-07-23 (aborted at the workshop)

The maintainer's fresh-start playtest, ABORTED at the repair system: "The repair system is
now a hard block... We need a proper re-design here first. It is the most important part of
the main gameplay loop and we have been neglecting it. This is now our top priority."
The redesign is the headline; items below per the standing cadence.

1. **Day counter randomly highlighted on walkthrough step 1** - FIX (hotfix): the welcome
   step anchors the spotlight to `day-value` with nothing for the player to do there; step
   one should spotlight nothing.
2. **Tutorial text too long per step** - COPY PASS (orchestrator-personal, after the
   redesign): condense without gutting the worldbuilding, and/or split into more, smaller
   steps. "Lots of players won't read" is the bar.
3. **Post-tutorial contextual teaching** - DESIGN (next onboarding sprint): one-shot
   pop-ups in the walkthrough box style as the player first touches systems: first sale
   (listing channels), first Staff tab, first Standing screen, first Upgrades visit, etc.
   Persisted seen-state. ALSO: the walkthrough's final box must say plainly that the game
   is open now: buy cars at auction, fix them, sell them, no mission required.
4. **Machine hire missing from totals** - FIX (hotfix, investigate first): the underbody
   row shows "machine shop assist +14,000" but Planned work totals and the Confirm button
   read 600 - 10 labour. Whether the fee is charged-but-hidden or not charged, the ledger
   must tell one honest total.
5. **CRITICAL: removed rims still block clicks on the brake parts** - FIX (hotfix): the
   diagram's rims hit-area intercepts clicks over the brake pads/calipers even after
   removal; brake parts unreachable. (The redesign replaces this diagram wholesale, but a
   click-blocker cannot wait for it.)
6. **Labour retune** - MAINTAINER-ORDERED LEVERS (fold into the redesign's table for exact
   sign-off): repairs 10 -> 5 labour, fitting 10 -> 3, with stated latitude ("or increase
   the labour pool, or both"). Exact per-tier values proposed in the redesign doc.
7. **THE HEADLINE: paint is not a part, panels vanish, the workshop needs a real design.**
   Paint can currently be "removed" like a component; body panels, once removed, never
   reach the inventory ("throwing them in the bin out back"). The maintainer wants a real
   bodywork mechanic (panel beating, putty, sanding, finishing, painting) as part of a full
   working-on-a-car rework. Design doc: `docs/design/workshop-rework.md`, drafted same day
   for the maintainer's review. Nothing implemented until the review.
