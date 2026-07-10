# Playtest notes — 2026-07-10

*Raw, unstructured notes from the maintainer's playtest session, captured verbatim as they came in
(matching the Sprint 10 precedent: play, dump raw feedback, turn it into the next sprint(s) later).
**Not yet triaged or designed** — no root-cause analysis, no sprint assignment, no reuse analysis.
This is the source material for that conversation, not the conversation itself. Update this file as
more notes come in during the same playtest session; do the actual triage/sprint-design pass only once
the maintainer says the session is done.*

## Notes (maintainer's own numbering, preserved)

1. **Cart/End-Day warning.** Need a warning on clicking "End Day" when there's stuff in the cart:
   "you have unordered items in your cart. Want to check out first? Return to parts shop | End day."

2. **Auction system rework — the core problem is that bidding is still blind.** Even with the
   Interest-meter indicators added in Sprint 10, there's no real feedback on what rivals are actually
   bidding. Proposed rework:
   - Buyout still purchases instantly at full price (unchanged).
   - Auctions become **multi-day** — they do NOT auto-resolve at End Day if the player has bid on
     them.
   - New tab/window in the auctions screen: "My Active Bids" (or similar).
   - An auction stays live for a set period and **only resolves once that period elapses** (or the car
     is bought outright). Variable duration by rarity: rare **Flash sales** (~1 day), standard
     auctions (2-4 days), rare **Long sales** for special cars (7+ days).
   - Every day the player can place/raise a bid. The next day, show a screen with: current highest
     bid, whether it's the player or an AI rival, and the yen amount.
   - Need a better desirability gauge — obfuscated but directional. Example: if an AI rival is
     internally willing to pay up to ¥200k and the current highest bid is ¥175k, show an indicator of
     that gap/"room to move," signaling "you're likely to get outbid if you don't raise."
   - More randomness in bidding: as designed above, bidding ¥175k against a ¥200k rival ceiling
     usually loses — but **rarely**, the player should get lucky and win low if rivals just don't
     press their advantage that particular auction.

3. **Critical: no parts inventory UI anywhere.** The player's purchased parts (and later, per note
   below, salvaged parts) aren't displayed in any dedicated menu. Called out as a significant omission,
   not a nice-to-have.
   - Related, deferred, flagged for later expansion: a **salvage and restore parts mechanic** —
     maintainer says they'll expand on this separately, just noting it exists for now.

4. **Installing parts needs a major rework.**
   - 4.1 **No undo.** Installing the wrong part on a component can't be corrected.
   - 4.2 **Needs to feel more visceral.** Some of this is "juice" for later, but the actual *physical
     action* of installing a part needs to feel like the player is doing something, not just clicking
     a button. Maintainer explicitly asked for thoughts/ideas here.
   - 4.3 **The install flow itself is wrong.** Right now it's a single "install <part name>" button
     under each component row. Instead: an "Install upgrade" button that opens the player's parts
     inventory, where they pick the specific part to install.

5. **Garage tab: replace the swap dropdown with drag-and-drop.** More broadly, general drag-and-drop
   for moving cars around the garage/bays would be a big usability win.

6. **Garage tab: move Facilities and Equipment into a dedicated "Upgrades" tab**, with real visual
   polish ("make it look nice").

7. **Open design question: should facility/equipment purchases be gated?** Maintainer doesn't want
   players able to buy the best equipment from day one — they should have to work for it. Explicitly
   raised as a question, not a decided requirement.

8. **Service-job board should hide jobs the player can't act on yet, with nuance.** No point showing a
   job that needs an engine crane if the player hasn't even bought a tire machine. But it shouldn't be
   a hard filter — the board should mostly show jobs completable with current equipment, while *rarely*
   surfacing 1-2 jobs that need the next equipment tier up, using them as a hint of what to buy next.

9. **Spelling standardization: "tyre" not "tire" — British spelling throughout.** (Small/mechanical,
   but explicitly called out — check for other Americanisms while touching this.)

10. **Auction cars should be progression-gated too.** Player shouldn't be able to bid on a nice Supra
    from day 1 — should start on shitboxes and work up. Maintainer explicitly asked: "how are we going
    to do that?" — open question, not a decided mechanism.

11. **Eventually: a real main/pause menu.** Continue, Settings, New Game, Load Game, etc. — "nice
    looking landing page." Explicitly flagged as lower priority ("at some stage").

## Rough thematic grouping (for triage convenience only — not a sprint plan)

- **Quick/contained:** #1 (cart warning), #9 (tyre spelling), possibly #6 (Upgrades tab, mostly a
  relocation + visual pass).
- **UI/UX reworks, self-contained:** #3 (parts inventory screen), #4.3 (install-flow entry point), #5
  (drag-and-drop).
- **Feel/juice, needs design thought before build:** #4.2 (visceral install), #4.1 (undo — also has
  real state-model implications: what does "undo" even mean once labor/cash has been spent?).
- **Large systemic rework:** #2 (auction system — multi-day resolution, new UI surface, bidding
  randomness model). Biggest single item on this list.
- **Progression-gating design questions, likely connected to each other:** #7 (equipment gating) and
  #10 (auction car tier gating) both fundamentally ask "gate by what, exactly?" — and both plausibly
  want to hang off reputation tier, which is a real, already-flagged gap: `reputationTier` is never
  actually *derived* from anything in the sim today (see `TODO.md`'s Sprint 13 follow-up on this
  exact point). Any reputation-gated system here inherits that same open dependency. #8 (job-board
  hinting) is adjacent — same "what should the player see access to, and when" family, but gated by
  owned equipment rather than reputation, so may not share the same dependency.
- **Deferred/later scope, explicitly flagged by the maintainer as such:** #3's salvage/restore
  mechanic (expansion noted, not detailed yet), #11 (main menu).
