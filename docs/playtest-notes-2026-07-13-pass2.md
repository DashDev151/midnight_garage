# Playtest notes - 2026-07-13, second pass (raw dump)

Maintainer playtest, dumped unstructured. Numbered 1-20 as given. Wording kept close to the
original. Triage and sprint design follow in `docs/sprints/sprint46.md` onward.

## The 20 items

1. Need a keybind on Esc and/or a button in the main nav bar to get back to the main menu.
2. Move the Save button out of the main nav bar to the main menu.
3. Standardise the End Day button position: only ever in a single place on screen, bottom right,
   and every page that has it puts it in the exact same place.
4. Stop including the graphics spike (rendered cars) in the main build. Do not delete the code,
   just don't have it in the game for now.
5. The parts store should not default to all parts (too many at once). Improve parts market
   navigation: make the top main cards (Engine, Drivetrain, etc.) large Hero Cards that, when
   clicked, expand to the next hierarchy.
6. Move the Cart section to the right of the parts list in a new thin column, not underneath -
   like a real online retailer's checkout cart (reference screenshot: Wootware basket panel).
   Keep all functionality.
7. Customer jobs should not have random missing parts (e.g. a randomly missing diff that has
   nothing to do with the job - how did the car even get here?). Auction cars can have select
   missing parts where it makes sense. Customer cars can be severely damaged/bad condition, but
   if something is missing it must be because replacing it IS the job.
8. The parts UI on a car is VERY busy. Simplify and clean up. No separate button per repair
   grade - instead a slider that defaults to one grade but can slide to more (worn part: slider
   has 2 ticks, tick 1 = fine selected by default, tick 2 = mint). Too many random buttons and
   hint texts, and a "Hide parts in good order" button on EVERY category. Remove those per-group
   buttons; have ONE filter at the top (dropdown checkbox) choosing which conditions of parts to
   show.
9. Auctions UI is way too busy. Redesign each car block: add a blank square placeholder for
   future pixel-art of the car model. The summary condition report and the full condition report
   are cluttered - different sized chips, overlapping and wrapping text, ugly and hard to read.
   Simplify, make more grid based, easier to read.
10. Auctions you are not part of say "dealer leads at X" - who is dealer? Weird framing. Just say
    "Leading bid" or similar.
11. Auction close logic suspect. Day 3: first player bid placed on a lot that ALREADY had a bid
    from someone else. Lot said "final call: closes at End Day unless a new bid comes in" - a bid
    DID come in (the player's). Fear: it closes overnight and the player wins instantly (would be
    incorrect). Observed: it did NOT close (good). BUT the player was leading 2 other lots, both
    on final call, NO new bids came overnight (still leading next day), yet they did NOT close
    that night either. At the end of the NEXT day all of them closed in the player's favor. Audit
    the auction close logic carefully and make sure it functions correctly (the badge and the
    hammer look out of sync by a day).
12. The Day Complete messages for won and lost lots are woefully bad: "lot-1-local-yard-1" - who
    would know what that refers to? Put the car name and year there.
13. Total restoration bill is a farce. Where does the value come from? It's wrong: it showed
    ~24k, the player did 6 repairs fine-to-mint, it cost ~35k, and the car is still not close to
    fully repaired.
14. Bought the City for 38k; now worth ~36k; restoring fully costs ~240k. Is this just an
    accepted loss, or is there an optimal strategy for recovering capital? Repair only cheap
    parts to pump value? Or is it a lemon to dump at a loss? BIGGER ISSUE: the car's worst
    condition is Worn - not even ONE scrap or poor part - so WHY is it worth so little? Lots of
    miles and old, but generally not in bad condition. Also concerning that so few poor/scrap
    parts appear at all.
15. Need a repair cost next to every repairable part, not just a single value per group.
16. "Staged" is dev speak - call it Planned (or similar) in player-facing copy.
17. Before work is Confirmed, show repair and parts costs in the Finances section and the work
    log, so the player can see what the repairs will cost and how they affect car value and
    potential profit BEFORE committing. The entire Finances section should update pre-confirm,
    clearly marked as an estimate. Related balance complaint: doing repairs and replacing parts
    on the City put the player DEEP in the red - guaranteed loss, feels terrible. It should be
    reliably profitable to buy at auction, do sane repairs/replacements (like brake pads), and
    sell. Overpaying for a car and fitting ultra race parts can be a net loss, but THIS case
    should not have been. Needs balancing.
18. Slow down the number of jobs available at the start - overwhelming for new players who think
    they must do all of them. Start with a slow trickle that gradually gets more frequent.
19. Dev speak in player copy: "Tier 1 of every line is free from day one - nothing basic is ever
    locked. Tiers 2 and 3 cost cash AND reputation, the same gate bays use." Nomenclature like
    "gate" must NOT be player facing.
20. Rethink the reputation gate on tools. A gate is good; a SINGLE gate that opens EVERYTHING at
    once is not - it just shifts the original problem later. Machines should become available
    gradually, not all at once. Think about how to make it better. Also the Upgrades page is
    ugly: line things up, better spacing, cohesive design language for upgrades and facilities,
    nice symmetrical cards.

## Screenshot observations (data points captured from the session)

- Honda City E (AA), 1984, 92,937 km, bought at auction for Y38,170. Finances panel before any
  work: guide value Y36,339, restoration bill remaining Y238,800, projected profit -Y1,831.
- Same car after some work: repairs Y14,400 + parts Y39,600 = Y54,000 spent; bill remaining
  dropped only to Y194,400 (a Y44,400 reduction); guide value UNCHANGED at Y36,339; projected
  profit worsened to -Y55,831. Y54,000 of real spend produced zero value movement.
- Honda Civic SiR-II (EG6) lot: guide value Y585,180, reserve Y292,590, full-report restoration
  bill Y121,650, dealer leads at Y442,590, buy now Y731,475.
- The City's parts are all Fine/Worn/Mint - zero poor, zero scrap - yet guide value sits at
  Y36,339 against a Y180,000 book.
- Upgrades tool wall: every line's tier 2 shows "needs local reputation" simultaneously (the
  all-at-once complaint in item 20); help copy shows the "gate" wording in item 19.
- A car detail screenshot shows Drivetrain group "Fine Y71,500" with Differential "Empty MISSING"
  (context for item 7).
