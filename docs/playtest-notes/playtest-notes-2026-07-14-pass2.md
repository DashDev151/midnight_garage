# Playtest notes - 2026-07-14, second pass (post-Sprint-58 build)

Maintainer session against the committed Sprint 58 build, with screenshots (main menu, parts
market home, upgrades wall, day report, car repair rows, confirm button, Grand Touring parts
list, a customer job card, a car Finances panel). Nineteen items, numbered as given. Structured
here per the standing triage workflow; the sprint mapping is at the end.

## Presentation and chrome

1. **The menu is not a real menu.** It renders as one tab among many, inside the full game
   chrome (header, nav bar, its own "Menu" nav link). It should be a proper main/pause menu:
   full screen, no tab, outside the gameplay chrome.
2. **The Save UI on the menu is bad.** A "Save" section title sits above a tiny, differently
   styled "Save" toggle button ("Save: Save"). The save controls should look like the other
   menu buttons, and the redundant extra title should go.
3. **Auction card: Buy Now is dangerous.** It is prominent and sits directly against the bid
   button - too easy to press by accident. Demote it and separate it from the bid action.
4. **Widespread asymmetry from text wrap.** Sibling elements of the same kind render at
   different sizes because wrapped text changes their height - worst in the parts store (hero
   cards) and the upgrades page (tool wall, facility cards). Lock same-kind elements to the
   same size, or fix the wrapping and flex heights. It looks bad.
5. **Gate-explanation sentences crammed into tiny blocks.** "Your standing isn't there yet -
   needs local reputation" is repeated as permanent text inside every gated tool node and both
   facility cards. Grey the block out and move the explanation into a tooltip. Full audit
   required: ALL hint text of this kind becomes tooltips instead of permanent screen clutter.
6. **The end-of-day report needs real design work.** Lines like "New local-yard auction
   catalog: 1 lots" are useless clutter (and grammatically wrong). Cut unnecessary text, make
   the report visually appealing.
7. **The car repair rows are cluttered.** Whole sentences live inside buttons ("Repair to worn -
   ¥300 · 1 labor"). Wants proper separate elements: current condition, then the new condition,
   a single cost (with a subtle +XXX increment indicator where relevant). Clean it up.
8. **The Confirm button shows the wrong number, and is a sentence.** "Confirm (4 labor left
   today)" is the labour REMAINING today, shown before anything is planned - the player has no
   idea how much labour clicking will actually spend. Buttons get words, not sentences. Also
   "labor": British spelling is a core directive, everywhere.
9. **Rename "Wheels" to "Wheels and Tyres"** in the parts store and the inventory.

## Market and jobs

10. **The "fits this vehicle" filter must include inbound customer cars** - a job accepted
    today whose car arrives tomorrow. A core loop is: accept the job, order the parts, then
    both parts and car arrive the next day. The filter currently can't serve that loop.
11. **Shop parts render greyed out yet are still clickable/buyable.** Dimmed-to-0.55 reads as
    disabled. Fix the affordance.
14. **Generation coherence bug.** Customer flavour text says "Vibration at speed, feels like
    the tyres need balancing" - but the rolled car's tyres are MISSING entirely. The symptom
    text contradicts the car's actual state. Need generation-time sanity rules so this class
    of nonsense cannot happen.
15. **Job cards and auction lots need a small, subtle car-class indicator** (kei / sports etc.).
    Players will otherwise buy sports-class tyres for a Supra-class job, or vice versa.
17. **No view for granular reputation and specialty.** Every job raises rep and mastery, but
    there is nowhere to SEE the current granular numbers. The single rep card is not enough.

## Economy

12. **Starting cash (¥1,500,000) is too much** for the current economy. Do the maths and pick a
    new amount - easily configurable - around ¥300,000.
13. **Winning an auction reads as a loss.** The next-day summary leads with a big red
    -¥156,030. Mathematically correct, emotionally wrong: winning should be a celebration.
    Redesign that presentation.
16. **Service jobs pay too much.** ~¥47k profit for installing a set of tyres is too much.
18. **CRITICAL - the hierarchy-of-repairs system.** The TODO entry (build coherence / "hierarchy
    of needs for cars", captured 2026-07-14 pass 1) must now be designed as a full, proper
    system: if foundational things are broken, it must not matter how many fancy parts are
    bolted on; cars need a baseline-condition concept before add-on value counts.
19. **Instant flips pay far too much.** ~¥156k profit for buying a car at auction and selling
    it immediately, untouched (observed: purchase ¥156,030 vs guide ¥312,060 - exactly half).
    An unimproved same-condition flip should net a few thousand yen profit to a few thousand
    yen loss at most. The whole point of the game is that the car must be improved.

## Triage -> sprints

Designed as Sprints 59-65 (docs/sprints/sprint59.md onward). Economy first - items 18 and 19
are the critical ones - then trust/legibility, then chrome.

| Sprint | Items | Theme |
| --- | --- | --- |
| 59 | 12, 16, 19 | The earned yen: kill the instant-flip margin, retune job payouts, cut starting cash |
| 60 | 18 | The foundation law: hierarchy of needs for car value (economy-bible amendment) |
| 61 | 10, 14, 15 | Honest offers, legible market: flavour sanity rules, inbound cars in the fit filter, class chips |
| 62 | 17 | The standing view: granular reputation and specialty, surfaced diegetically |
| 63 | 7, 8, 9 | The work order: clean repair controls, honest Confirm, British spelling sweep |
| 64 | 3, 6, 13 | The morning report and auction-card safety |
| 65 | 1, 2, 4, 5, 11 | Chrome: a real main menu, one save surface done right, tooltips, symmetry, affordances |
