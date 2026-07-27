# Playtest notes - 2026-07-15 (post-Sprint-65 build)

Maintainer session against the committed Sprint 65 build (the whole pass-2 arc, Sprints 59-65,
now live), with screenshots (an auction lot card, the tools tech tree, the car-page components
panel mid-plan, the stat radar, an in-transit customer job, the Replace drawer). Twenty-five
items. Structured here per the standing triage workflow; the sprint mapping is at the end.

Maintainer framing: "These are smaller tasks and can be structured as less sprints."

## The two real system problems

**19. The repair economy still doesn't reward the work.** "At least now I am not actively losing
money anymore, but repairing all parts from poor to worn should at least offer a little bit of a
sale value bump. I have done a lot of work on this car and the projected profit is still pretty
much similar or lower than if I just immediately sold it. That should never be the case. It
should always be more profitable to make sensible repairs or replacements to a car and then sell
than just selling the piece of shit." (The Economy Rebuild arc's Law 1 claims every repair yen
returns >= 1.2 yen of guide value; the playtest says a real poor-to-worn pass does not visibly
clear that bar. Investigate before tuning.)

**6a. Generated cars are incoherent.** Verbatim: a `Nissan 180SX (RPS13)`, `uncommon · 1995 ·
11 km · Red`, flavour "dealer trade-in, service history unknown", carrying mostly WORN parts.
"The car has 11km on it. It's BRAND new. How can it have worn parts? MOSTLY worn parts at that.
Was that 11km driven on the surface of the sun? How can the service history be unknown? Why is
the car coming to a backyard mechanic if it was just bought from a dealer? You need to think
about this. We need sanity check rules before just producing any combo. There likely needs to be
a minimum mileage cap at least but ideally a better system."

## Car page (the work order)

**7. The inline repair cost goes stale past one rung.** Screenshot: the Engine row reads
`Poor -> Fine`, `+ +¥4,800 · +1 labour`, but the Confirm button reads `¥9,600 · 2 labour` (the
real planned total for the two rungs). "The new system for repair works well for ONE rung but
whenever you try to do more than one rung it breaks... need to update how it is displayed inline
on the components to stay accurate."

**18. The condition filter is buggy.** "It will show missing slots even if only poor is selected.
Also we need a Show All button as well as an Unhide All button."

**10. A legitimately-absent slot is not 'missing'.** An empty forced-induction slot on a
factory-NA car must not appear when the `Missing` filter is selected.

**9. Add an Expand All button** on the car repair screen.

**16. Component category order must be constant.** "Engine always at the top, followed by
drivetrain or whatever, just keep the sorting constant." (Note: this reverses Sprint 41 decision
4, which sorts worst-band-first deliberately - flagged for the maintainer below.)

**8. The radar graph is hard to read.** "Add grid lines, fix the text to be more legible and not
overlap with the graph, just make it look better overall."

**13. A primary card for daily labour remaining**, on the main garage view and the car repair view.

**12. An in-flight job must still show its work.** "Once a job has been accepted and the car is in
flight we should still show what needs to be done with the car. I accepted a job but forgot what
the customer wants so I can't remember if I need to buy parts. Need to be always visible. DRY this
view to be the same everywhere."

## Jobs, offers, provenance

**17. Part provenance is wrong (real bug).** Verbatim: "I needed to install Street or better
dampers on a customer car. I wrongly installed Stock Dampers. I then removed the stock dampers
(that I just purchased) to install the correct Street Dampers. BUT, the stock dampers are now
being seen as a Customer part, because it was installed on the customer's car. Even though I
purchased and installed the part. We need a better way of tracking part provenance and history so
that nonsense like this does not happen."

**11. End Day should warn about unfinished business**, the same way it already warns about a full
cart: (a) "you have completed a customer job but have not handed back the car, call them up?";
(b) the player has queued labour but has not confirmed it yet.

**21. Add a "reject offer" button.** "I know that the player can just wait out the day but it is
more satisfying to explicitly reject."

**22. A car chip with a live offer needs a badge** - "a floating ? or yen sign or something".

**23. On sale, give a final financial summary** including the final profit made on the accepted
offer.

## Chrome and legibility

**1. End Day button: drop the cash in parentheses.** "Just let the text say End Day and nothing
else."

**2. End Day button: make it more tactile**, like the +/- stepper buttons in the auction house.

**3. "YOU LEAD" is redundant on the auction card** - it renders in more than one place. Choose one
good place.

**4. The tools tech tree renders badly.** "Suspension and Brakes is different from the others
because the title is longer and wraps." Also: "there is an ugly horizontal scroll bar, get rid of
that." (Sprint 65 added a two-line min-height for the header; the screenshot shows it is still
uneven, and the scrollbar is untouched.)

**5. Drop the auction-catalogue line from the day report.** "'1 new lot at the auctions' - that's
really awkward wording. In fact remove it entirely, the player can just check the auction house,
we do not need to report on movement of lots coming in and out every day."

**6b. Auction wins still aren't clear enough on the day-end screen.** (Sprint 64 reworked this;
the maintainer says it still doesn't land.)

**14. Part grade needs to be visible in the parts shop** - a colour-coded chip for
stock/street/sport/race.

**20. Move the event log off the main garage view** - "somewhere less prominent like a side menu.
It does not need to be on the main garage menu."

**15. Auction churn is too slow.** "There should be more cars that the player can bid on, so make
this a little faster."

**24. Reputation and specialty still have no proper home.** "WHERE are we actually PROPERLY
showing rep and mastery? Where can I see my current rep and distance to next level? Where can I
see my current mastery for each component? We need a proper dashboard for this with proper visuals
and it needs to be on the upgrades screen."

*Triage note, corrected 2026-07-15. Sprint 62 DID ship a `/standing` screen carrying exactly these
numbers. The first draft of this note said "the maintainer did not find it" - that was wrong, and
generous to the implementation. The route was registered, but BOTH entry links were styled
`color: inherit; text-decoration: none; border-bottom: 1px dotted var(--mg-panel-edge)`: plain-
coloured, un-underlined text with a near-black border on a near-black panel. Nothing on screen
indicated either was clickable. The screen was **effectively unreachable** - a defect, not a
discoverability nicety, and the maintainer's "how does a player GET to the standing screen? They
can't" was correct. Fixed immediately, ahead of the sprints (commit `8d6a8ee`): a real Standing nav
entry, both links restyled as visible links, and an `App.test.ts` regression test pinning that the
nav link resolves to `/standing` AND that the route renders - so "the route exists" can never again
be mistaken for "a player can reach it". The lesson recorded: a DOM-reachable screen is not a
reachable screen, and a sprint Exit claiming a screen is "reached diegetically" must mean reached
by a person.*

## Maintainer follow-up, 2026-07-15 (after seeing the Standing screen)

- **The Standing screen stays where it is.** Verbatim: *"The standing page is fine, don't move it
  to upgrades."* This CANCELS the first draft's proposal (Sprint 69 decision 1) to fold it into
  `UpgradesScreen`. Recorded; not to be re-litigated.
- **Progress bars, on that screen.** *"Make the mastery progress bars. Like 19/120 to next level.
  Same with Rep."* (Requires the second progression-bible Law 4 amendment - Sprint 62's amendment
  permitted exact numbers but explicitly kept "no bar, no percentage".)
- **The ladder is too short.** *"Rep levels are climbed too quickly. Raise the rep level needed for
  every rep rung."* Two findings fall out of this on inspection: (a) `REPUTATION_TIER_THRESHOLDS`
  is hardcoded in `packages/sim/src/constants.ts`, breaking the content law (engineering law 2) -
  the very numbers being tuned live in code; (b) rep accrues ~1/day early, so the `local` threshold
  sets days-to-`local` almost 1:1, and that figure is HARD-GATED to [10, 35] - `local` can rise to
  ~25 and stay legal, but not far past it without a recorded band move. The upper rungs carry no
  gate and are where the real steepening belongs. Full proposal in `sprint69.md` decision 4.

## Decisions needed from the maintainer

- **Item 16 vs Sprint 41 decision 4.** The car page currently sorts component groups
  worst-band-first, deliberately, so the roughest work surfaces at the top. Item 16 asks for a
  constant order (Engine first, always). These are mutually exclusive. Taken as: constant order
  wins (the maintainer's explicit instruction); Sprint 41 decision 4 is retired, recorded.
- **Item 24 vs progression bible Law 4.** Law 4 bans meters/bars/toasts/floating numbers; Sprint
  62's amendment permits exact NUMBERS on one dedicated pull-not-push screen but explicitly keeps
  "no bar, no percentage". The maintainer has now asked for bars on that screen. This needs a
  second recorded Law 4 amendment; `sprint69.md` decision 3 proposes one (ambient meters stay
  banned everywhere; the one screen you open on purpose may use bars) and the maintainer's sprint
  approval is the sign-off.
- **The rep ladder vs the days-to-`local` hard gate.** Raising `local` past ~25 pushes the
  hard-gated days-to-`local` p50 out of [10, 35]. The proposal keeps `local` at 25 and steepens the
  ungated upper rungs instead; a slower first rung needs a recorded band move (Sprint 29
  precedent).

## Triage -> sprints

Designed as Sprints 66-69 (fewer, larger sprints per the maintainer's framing).

| Sprint | Items | Theme |
| --- | --- | --- |
| 66 | 19, 6a, 15 | The honest car: the sale-value law, generation coherence, auction churn |
| 67 | 7, 8, 9, 10, 12, 13, 16, 18 | The work order II: an accurate plan, a readable car page |
| 68 | 11, 17, 21, 22, 23 | Provenance and closure: whose part, which offer, what did I make |
| 69 | 24, 1, 2, 3, 4, 5, 6b, 14, 20 | The standing pass (bars, a longer rep ladder), and the small cuts |
