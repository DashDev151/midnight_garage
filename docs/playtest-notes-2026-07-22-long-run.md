# Playtest notes, 2026-07-22 (the long run, round 1)

The maintainer's long playtest of the post-Sprint-112 build; the run PAUSED at item 7 (the
maintainer's declared blocker) pending investigation and a fix plan. Status per item: DONE
(landed same day), ANSWERED (explained from code, no change unless the maintainer disagrees),
INVESTIGATE (fact-finding running before any design), DESIGN (needs a decision, then a
sprint), BLOCKER (the run does not continue until resolved).

1. **"There is no deadline; she is happy to wait." vs the express-delivery lesson** - DONE
   (removed by direct order): the line preached patience two steps before the tutorial
   deliberately buys speed; the step now reads "Accept the job when you are ready."
2. **"Local Yard" wants a real, thematic name** - DESIGN (maintainer picks from candidates;
   suggestions offered in the session reply). Note for the pick: a named VENUE (a place with
   a day of the week and a smell) does more work than a category label, and each auction tier
   can eventually carry its own named venue.
3. **Restoration bill / theoretical values shown everywhere** - SCOPE RULED (maintainer,
   same day). REMOVE: the always-visible "Total restoration bill" line, the Finances
   disclosure's "Restoration bill remaining" and "Projected profit" rows, and the planned
   -estimate block's projection rows (planned repair COST stays: real money about to be
   spent). KEEP: "the room says"/you-say (the knowledge game), the diagnosis checklist's
   "if true" prices (the fear system), and the Sell section's "Expect X to Y" (kept by
   explicit ruling; the maintainer notes selling as a whole is too flat and wants a rework
   designed: haggling ruled out as thematically wrong; parked as a design item in TODO).
4. **How often does the spite counter fire on a sweep-in?** - ANSWERED from the machine:
   eligibility is the sweep-in moment only (the first raise ever to push the next room rung
   past the room's drawn clearing price, with at least one dealer still active, at most once
   per room); an eligible sweep draws `spiteChance` = 0.35, and even a drawn hit is discarded
   silently if landing one rung above the player would sit at or above the room's read. So:
   roughly one in three sweep-ins, less when the sweep already sits within one rung of the
   read, never twice in a room. The observed City E hammer (no counter) was the 65% case.
5. **CRITICAL: the growing auction log moves the bid buttons** - DONE (same day). THREE shift
   sources found and closed under one never-moves principle: the unbounded log (now a
   fixed-height window rendering only the newest 5 lines, older lines fading upward, no
   scrollbar); the actions row vanishing while the player leads (now always rendered while
   the room is open, buttons disabled instead); and the dealer "out" badge growing its seat
   mid-round (now always rendered, visibility-toggled). The past-the-number warning line also
   reserves its height permanently. The machine's full log is untouched (tests still read it).
6. **The player's cash balance must be visible on the auction floor** - DONE (same day): the
   room header now carries "Cash: ¥X" (yen-gold, matching the other screens' convention) in
   both the production room and the demo bench.
7. **BLOCKER: bought a clean car and there is nothing to do with it.** The City E hammered at
   ¥123,887 (est ¥134,340) with every part already at worn or better: zero below-expectation
   repair play, so every possible repair sits in the punitive beyond-expectation regime from
   the moment of purchase. The maintainer's verdict: a massive gameplay failure; the run is
   paused until this is understood and fixed.
   **Measured (600 seeded lots per tier through the real generation path, seed 42):**
   (a) NOT a rare roll: 32.2% of shitbox lots carry zero repair play, 20.2% are completely
   play-less (no bill, no symptoms); the City E model matches its tier (32.0%/19.8%).
   Common/uncommon sit at ~5% and rare at 0.5%, because only shitbox's expectation band is
   `worn` (a bar most rolls clear for free); every higher tier expects `fine`.
   (b) The provenance line and the clean bands share one upstream cause: the 25%-weighted
   `cherished` upkeep roll both selects that note pool AND raises the condition baseline,
   narrows jitter, and forbids missing slots. The fiction does telegraph it, honestly.
   (c) Pure flip on the City E as bought: net -2,947 to +13,174 (mid +5,114) after ~1.4 days
   of rent; the price paid sat at the top of the steady clearing band. Bought at a thin
   room's clearing (~99-114k), the same flip nets roughly +15-30k: the flip play exists but
   lives entirely in buying discipline, and nothing teaches it.
   (d) The reputation play is illusory here: all-worn sells for 0 rep; reaching the clean
   bar costs ¥40,670 (above-expectation spend, mostly unrecoverable by design) for +2 rep;
   concours is HARD-BLOCKED by the generation-time authenticity roll (65 vs the 85 floor),
   which no repair spend can change.
   Design session with the maintainer against these numbers; options tabled in the session
   reply. Nothing touched yet.
   Side finding: `AUCTION_TRAVEL_FEE_YEN` (economy.json, `local-yard: 8000`) is
   schema-validated but read by nothing; the real visit fee is
   `diagnosis.travelFeeYenByTier`. Dead content, parked in TODO.
