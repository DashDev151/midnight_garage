# Sprint 209: the world gets its places

**Status: APPROVED (fix arc wave 3, playtest notes 2026-08-16: session-1 notes 4 and
7, session-2 notes S2-5 and S2-6).**

**Goal:** the overworld is the way to everywhere; the garage gets its office; day one
shows a small, honest world that grows.

## Reuse analysis (directive 16)

**Reused:** all four auction buildings already stand on the map (local-yard,
regional-auction, premium-auction, collector-network in `overworldNav.ts`) - this
sprint re-wires destinations and gates, it builds no buildings; per-tier cadence
already lives in content (`cadenceByTier`, remapped to the 5-day week in Sprint 204);
the auctions screen already renders per-tier rooms - each building lands scoped to its
own tier; the inert-location refusal idiom for shut houses; the cafe mechanic is fully
built in sim (`cafe.ts`: labour buy-back, day cap, headcount pricing) - it gains a
presentation, not a system; the Standing screen's office-wall section and the season
planner (Sprint 204) move into the office; `isSellingChannelUnlocked` for channel
visibility.

**New:** per-tier auction destination routing and accessibility state, the office
room screen, the cafe interior beat, and the channel-visibility rule. No new
mechanics anywhere in this sprint.

## Tasks

### A. Auction houses are places (S2-5)

- A1. Each map building lands in its own room: the auctions screen scoped to that
  tier, no tier tabs. The top-bar "Auctions" nav tab is deleted; the overworld is the
  only way in.
- A2. Day one, only the Local yard is accessible. The other three stand on the map
  shut, refusing with the inert idiom (a line each, lead-written). Accessibility
  follows the existing tier-unlock progression; nothing new is invented here.
- A3. Schedules re-decided deliberately against the 5-day week and recorded here:
  local M/W/F, regional Tu/Th, premium Fri, collector alternate Fri (the Sprint 204
  remap) reads correctly spaced; the decision this sprint is to KEEP it and surface
  each house's days on its shut/open building card, so the calendar is knowledge the
  map gives away rather than trivia the player discovers by bouncing off a door.

### B. The office (S2-6)

- B1. A room in the garage (station-idiom entry beside the work stations), holding
  as plain blocks: the wall calendar (moved from Standing), the phone (the jobs
  board), Standings and Rep (the corkboard fiction, moved from the Standing screen),
  the Listing Channels picker, and the cash register (the cost sheet). Rudimentary
  blocks by explicit instruction; no art beyond the existing panel idiom.
- B2. The top-bar tabs whose whole content moved (Standing, Costs, Phone/Jobs) point
  into the office or are removed, one decision per tab recorded at implementation.
  The nav thins; the world thickens.

### C. The cafe is a place you enter (session-1 note 7)

- C1. Clicking the cafe opens a small interior beat instead of resolving instantly:
  the menu (today: coffee, priced by headcount as the sim already computes), the
  once-a-day state visible, and the buy action. Same resolver, now with a door.
- C2. The menu structure anticipates Sprint 210's "usual order" community upgrade
  without building it: a menu list, not a single button.

### D. Day one shows only what exists (session-1 note 4)

- D1. The channel picker lists ONLY channels the player has: Shop Front on day one.
  Locked-but-visible rows are removed (this resolves Sprint 205's open Law 4 question
  in favour of the bible: absent, not present-but-locked). `freeAdsPaper` appears when
  the stand job hands it over; mission-gated channels stay absent until earned, as
  they already were. The trade network leaves the day-one UI too (the ruling names
  it) and is earned from **Ebisu** (maintainer ruling 2026-08-16): the cast doc
  already maps `tradeNetwork` to him one-to-one ("the trade is Ebisu; its offer
  chance and price band are his handshake"), and the mission that opens the premium
  auction room ("the-showroom-standard", `unlocksAuctionTier: "premium"`) is his
  guarantor beat. That one mission gains `unlocksSellingChannel: "tradeNetwork"`:
  the dealer who signs you into the premium room starts taking your calls in the
  same breath. One beat, two doors, both his; zero new machinery (the
  tunerMagazine/weekendMeet claim pattern, both fields already coexist on missions).
  The mission's persona is still the pre-cast `ishida`; Ebisu takes the slot at
  Phase 4 cast wiring, and the claim rides through the maintainer's coming mission
  redesign with the mission. With this, every channel has a face and a moment:
  shop front day one (the Mechanic's own door), free ads from the newsstand,
  weekend meet and tuner magazine story-earned, the trade from Ebisu at the premium
  threshold, collectors from Kurogane's arc. Making that last clause true today:
  nothing claimed `collectorNetwork`, so "open unless claimed" would have left it on
  the day-one list against the ruling; "the-quiet-crate" (Kurogane's mission, which
  already opens the collector auction room) gains the `collectorNetwork` claim, the
  same one-beat-two-doors pattern, and the Hall of Legends arc inherits or moves the
  claim when it is built. Day one's channel list is exactly `shopFront`.

## Definition of done

- No auctions tab; four houses on the map, one open on day one, each naming its days.
- The office exists and holds its six blocks; moved surfaces have one home each.
- The cafe has an inside; coffee works as before.
- Day one's channel list is exactly what the player owns.
- Narrowest tests once; pre-push gate is the evidence.

## Exit

**Implemented 2026-08-16 by two agents (one respawned mid-flight after stalling on its
own discovery step), then verified whole. All green.**

- **Auctions are places (A).** Each map building lands in its own tier-scoped room;
  the tier tabs and the nav tab are gone; the three shut houses refuse with the
  existing guarantor lines, surfaced on the map where a locked player can finally
  read them, and every building names its sitting days from `cadenceByTier`
  (values unchanged, decision recorded). A shut room says when it sits again in
  spoken cadence ("tomorrow", "on Thursday", "a week on Friday").
- **The office (B).** `OfficeScreen` (route `office`, a garage station door beside
  the work stations) holds the six blocks: reputation, the scenes corkboard, the
  office wall with the season calendar, the phone (second door to the jobs board,
  which keeps its tab), the listing-channels summary, and the cash register (the
  whole cost sheet). `StandingScreen` and `CostSheetScreen` are deleted with their
  routes; every deep link repointed; their test coverage moved intact.
- **The cafe (C).** A walk-in interior with a menu LIST (ready for the community
  "usual order" without reshaping), the once-a-day state visible, and the refusal
  copy moved, not duplicated.
- **Day one shows only what exists (D).** The picker renders owned channels only;
  the locked-row machinery is deleted end to end. `the-showroom-standard` claims
  `tradeNetwork` and `the-quiet-crate` claims `collectorNetwork` (the schema refine
  now forbids only `shopFront`), so day one is exactly Shop Front and every channel
  has a face and an earning moment. Sprint 205's Law 4 question is closed the
  bible's way.

**Evidence:** full suite 229 files / 4,721 tests, 0 failures after the close-out
(one process-narrative comment caught by the hygiene guard and reworded);
`pnpm typecheck` clean across all three packages. Pre-push gate re-verifies at push.
