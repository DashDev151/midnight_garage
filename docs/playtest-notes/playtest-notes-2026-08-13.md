# Playtest notes, 2026-08-13 (half the tutorial, day 1, abandoned)

**Session:** the first session ever captured by the Sprint 24 session log. 21 events, day 1,
through the tutorial lot purchase and into the engine teardown, abandoned at the machining
station. Log archived at `docs/playtest-notes/sessions/2026-08-13-day1-half-tutorial.json`.
Maintainer verdict on exit: "full playtests are not possible right now, there are way too
many bugs like these". Every finding below is verified against code, file and line cited.

## Findings

### 1. BLOCKER: a stale tutorial line strands the player at the head repair

The tutorial (`tutorialSteps.json:278`) says "Click the Head on the bench and press the
Repair button". That Repair button no longer exists: the benched-member panel offers only
Replace and Take it off (`CarDetailScreen.vue:1495-1520`). The panel's own comment records
the current design: putting a member right means pulling it into the warehouse and carrying
it to the workshop floor. The tutorial teaches a UI that was removed, at the exact moment a
new player is doing their first repair. This is what ended the session.

The current correct path, for the record: remove the assembly, Take it off (part lands in
`partInventory`, the warehouse), garage interior, Workshop Floor room, Put it on the bench
(`WorkStationTray.vue:64`), recondition (`WorkshopFloorScreen.vue:53-55`). No tool gate:
bench work is possible at every tier, slower at tier 1 (`jobs.ts:1503-1507`); tier 1's
repair ceiling is `fine`, mint needs the tier-2 machine; `scrap` is never reconditionable.
A poor head is therefore fully repairable to `fine` on day 1.

### 2. The machining station is a silent dead end for a worn part

The player carried the poor head to the machine station; machining requires the part to be
at `mint` (`machiningJobs.ts:181-201`), so nothing was offered, and nothing said why. Log
shows `placeOnStation` and `takeFromStation` three seconds apart. A station that refuses a
part must say the reason ("machining wants a healthy part; recondition it first, on the
workshop floor bench"). Note the two stations also share a visual language while doing
entirely different jobs (repair vs performance), which invites exactly this confusion.

### 3. COSTLY: Sell is one unguarded click, and the loss is severe

`PartCard.vue:183-191`: the sell handle fires on a single click, no confirmation, no undo.
Resale is `priceYen x resaleBandFactors[band] x usedPartSaleFraction (0.3)`
(`bands.ts:123-131`, `economy.json`), so a just-bought mint part returns 30% instantly.
The log shows the full cost of one misclick: event 10 buys tyres express, event 11 sells
them, event 12 buys them again express. Roughly 70% of the part price plus a second express
surcharge, lost to a slip.

### 4. Discoverability: the repair rooms are not on the tab bar

Workshop Floor and Machine Shop are reachable only through the garage interior rooms
(`App.vue:119-128` exposes Inventory but neither workshop route). The tutorial never names
the warehouse flow or the bench carry (`tutorialSteps.json:257` says parts "wait safely in
your inventory" and stops there). "Workbench" appears in no player-facing copy; the player
had no word to search for.

### 5. Instrumentation findings (Sprint 198 intake)

- The export pipeline works end to end: clean JSON, typed day-stamped events, refused
  actions absent. First real artefact; it becomes the converter's first fixture.
- Replay payload gaps found immediately: `checkoutCart` records `boughtCount` but not what
  was bought; `sellPart` carries only a `partInstanceId`. The converter cannot replay
  either without payload enrichment. Added to Sprint 198 as task 198.8.

## Triage (designs to propose, nothing implemented)

A playability sprint (201, "make play possible") goes ahead of any full-session capture:
the stale tutorial step (finding 1), station refusal reasons (finding 2), a sell guard,
confirmation or undo (finding 3), and a discoverability pass on the two workshop rooms
(finding 4). Scope goes to the maintainer as a sprint doc before implementation. None of it
touches a lever. G1 on the integration board (the full recorded session) is deferred until
201 lands; short bug-hunt sessions remain valuable, and every export is converter fuel.
