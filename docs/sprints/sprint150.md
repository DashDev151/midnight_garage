# Sprint 150: the rooms keep their own hours

**Status: READY TO IMPLEMENT.** Three decided changes, no design work outstanding. Every value
here is already ruled by the maintainer.

**This sprint is deliberately small and is not the old plan's Sprint 150.** The sale-value
implementation plan's §6 mapped S8 (the buyer flow model) to this number. That mapping is being
redone: the maintainer's listing-channel ruling of 2026-07-31 changed what a channel IS, which
invalidates the shape of the old S8 and S9. **The arc gets re-planned after the desirability and
listing-channel designs are locked.** This sprint takes the number because it is next, and
carries none of S8's scope.

## What this delivers

Three things that are decided, unrelated to the pending designs, and all auction or sale
adjacent, so they belong in one change rather than three.

1. **Auction rooms open on their own schedule**, replacing one global auction day.
2. **The two reserve fractions agree** at 0.6.
3. **Listing fees land on the car**, where they belong.

## 1. Per-tier auction cadence

### The defect

`calendar.auctionDayOfWeek` is **3**: one global day, every room, once a week. Two problems.

**A new player is sent to a closed auction house.** Day 1 is not day 3, so the tutorial points at
shutters and the player waits two days before the core activity of the game is available. This
is a live bug, recorded in `sprint149.md`'s Exit and `TODO.md`.

**And it makes the late game wait.** A player with millions to spend gets one buying day a week,
which is backwards: earning access should give you more to do, not less.

### The ruling, 2026-07-31

**Cadence belongs to the VENUE, not the calendar.** Signed as tabled:

| auction tier | open on days | cadence |
| --- | --- | --- |
| `local-yard` | **1, 3, 5, 7** | every week |
| `regional` | **2, 4** | every week |
| `premium` | **6** | every week |
| `collector-network` | **6 and 7** | **every second week**, fresh lots each day |

Two rulings ride with it, both explicit:

- **The day-6 overlap between `premium` and `collector-network` on alternate weeks is
  deliberate. Keep it.** More than one room open on a day is desirable.
- **Attending an auction does not cost the day.** A player may attend more than one room on the
  same day. Do not add a gate that prevents it.

The maintainer noted the cadence may still have too few overlaps and that they like more than one
room per day, but ruled it ships as tabled for now.

### Shape

`calendar.auctionDayOfWeek` is **RETIRED** into the retired-identifier ledger. Cadence moves onto
the auction tier as `openDaysOfWeek` (a list of day-of-week numbers) and `weeksBetween` (1 for
every week, 2 for every second). A tier is open today when today's day-of-week is in its list
**and** the current week index satisfies its `weeksBetween`.

Week 1 is an open week for every tier, so `collector-network` first opens on days 6 and 7 of
week 1. Do not phase it later.

## 2. The reserve fractions agree

`AUCTION_RESERVE_PRICE_FRACTION` is **0.6** and `auctionRoom.reserveFraction` is **0.55**. Two
numbers for one concept: the seller's floor. The maintainer ruled: **"set the reserve to 0.6
everywhere."**

`auctionRoom.reserveFraction` moves **0.55 to 0.6**. SIGNED.

Note this narrows the cold-room clearing band, because `clearingFractionFor` draws a bargain room
uniformly between `reserveFraction` and the turnout band's `clearMin`. That is a consequence of
the ruling, not a separate change, and no other lever may move to compensate.

**Consider whether the two constants should become one.** Two names for the seller's floor is how
they drifted apart. If they can be unified without dragging the whole room config into the sim,
do it and retire the loser into the ledger. If unifying them means moving room pricing into
`packages/sim`, do NOT do that here: it is a real piece of work with its own consequences and it
needs its own sprint.

## 3. Listing fees belong on the car

### The ruling, 2026-07-31

Running costs and per-car costs are different things:

> Machine-shop hire is NOT a per car fee. you could hire in the engine crane and remove 4 engines
> that day. not accurate to include it as a per car fee. same with rent and bays and staff costs.
> these are running costs. They accrue and should be shown on a overarching, maybe weekly,
> financial summary, but they are not attributed to a specific car. listing fees are however.

`CarLedger` today is `{ purchaseYen, repairYen, partsYen }`. A listing fee is charged per car, per
listing, and is missing from it, so the per-car profit the game reports is wrong by the fees paid.

**Add listing fees to `CarLedger`.** Machine-shop hire, rent, bays and staff stay off it and are
correct as they are.

**The periodic financial summary that ruling implies does NOT exist and is NOT in this sprint.**
It needs design. Record it, do not build it.

### Terminology

The maintainer has banned the phrase "machine line" in prose as ambiguous. Say **machine-shop
hire**, or name the machinery. This applies to comments, docs and any player-facing string.
`machineShopAssist` may keep its identifier.

## Reuse analysis (directive 16)

### Genuinely new

- `openDaysOfWeek` and `weeksBetween` on the auction tier's content.
- A week-index derivation, if `calendar.ts` does not already expose one.
- One field on `CarLedger`.

### Existing mechanisms reused

- **`calendar.ts`**, which owns every derivation from `state.day` and is guarded as the only
  place that does. The week index goes there if it is not there already. **Check first.**
- **`AuctionTierSchema`**, which already enumerates all four tiers.
- **The reputation gate on auction tiers**, untouched. Cadence says WHEN a room opens; the
  existing gate says WHETHER the player may enter. Two questions, two mechanisms, do not merge
  them.
- **`CarLedger` and `setCarLedger`/`updateCarLedger`**, which already accumulate per-car spend at
  the moment it is charged.
- **`resolveSetForSale`**, which already charges the listing fee. The ledger update goes at that
  existing charge site, not a new one.

### Must NOT be built

- **A gate preventing attendance at more than one room a day.** Explicitly ruled out.
- **The periodic financial summary.** Needs design; record only.
- **Moving room price formation into `packages/sim`.** Its own sprint.
- **Any change to which buyers a channel draws, or to any taste ceiling.** That is the pending
  listing-channel design and this sprint must not pre-empt it.

## Task breakdown

1. **Verify `collector-network` is reachable.** It is in `AuctionTierSchema` and in the content
   weights, but nothing has confirmed a player can actually get to it. If it is unreachable,
   author its cadence anyway and report the fact; do not fix it here.
2. **Content and schema** for `openDaysOfWeek` / `weeksBetween`, `.strict()` per guard G5, with
   the four tiers' values exactly as tabled.
3. **The open-today predicate**, in `calendar.ts` or reading from it. One implementation.
4. **Retire `calendar.auctionDayOfWeek`** into the retired-identifier ledger, with every reader
   moved across in the same change (guard G1: delete, never deprecate).
5. **`auctionRoom.reserveFraction` 0.55 to 0.6**, and rule on unifying the two constants.
6. **Listing fee onto `CarLedger`**, at the existing charge site.
7. **The auction screen** says which rooms are open today and when the next one opens, in plain
   words. It currently shows a single closed sign keyed on the global day. Follow the
   diegetic-UI law in `art-direction.md`.
8. **The "machine line" prose sweep**, including `workedExampleDoc.ts`'s generated strings.
9. **Tests and re-derivation.**

## Tests

- Each tier is open on exactly its tabled days, over a 28-day span.
- `collector-network` opens in weeks 1 and 3 and not in weeks 2 and 4.
- **Day 1 is an auction day** (`local-yard`), which is the tutorial bug closed. Assert it
  explicitly, naming the bug.
- Premium and collector-network are both open on day 6 of an open week. **Assert the overlap
  rather than avoiding it**, so a later change cannot silently remove it.
- A listing fee appears on the car's ledger and changes reported profit by exactly the fee.
- Machine-shop hire does NOT appear on any car ledger.

## Re-derivation

Expect the economy approval-gate hash and the `advanceDay` golden hashes to move. Re-derive, re-run
once to confirm stability, record old and new.

Run `pnpm typecheck` before reporting (directive 20 carve-out: this retires a lever and reshapes
`CarLedger`). Run `pnpm test --project sim` once at the end: it is green at 73 files and 1928
tests, and Sprint 149 proved a named-file list is not sufficient when the day cycle moves.

## Exit

**Landed as designed. All nine tasks done, nothing outstanding from the breakdown.** Not yet
committed; this doc moves to `docs/sprints/sprint_archive/` in the same commit that lands the
work, since nothing is left open in it. `sprint149.md` is archived in this change too: the
cadence it was held back for is now built.

### Task 1: is `collector-network` reachable? NO, and it is dark on purpose

**It is unreachable, by design, and this sprint did not fix it.** `isAuctionTierUnlocked`
(`packages/sim/src/catalogs.ts`) opens a tier only when some story-mission record reaches
`delivered` for a mission whose content carries `unlocksAuctionTier: <tier>`. `storyMissions.json`
carries exactly two: `regional` (`the-fleet-spare`) and `premium` (`the-showroom-standard`).
Nothing anywhere names `collector-network`, so no career can reach it.

This is not a defect: `packages/sim/tests/auctionGuarantors.test.ts` pins it under the name "D1a",
asserting the tier stays locked with BOTH guarantor missions delivered and reputation at `legend`,
and its comment records why (the tier waits on the Hall of Legends arc landing its own guarantor
mission). Its cadence is authored anyway, exactly as instructed, and its tests run against
`calendar.ts` directly rather than through a career, so they pass regardless.

**One consequence worth stating plainly:** the day-6 overlap between `premium` and
`collector-network` is real in the calendar and pinned by test, but no player can currently
experience it, because one of the two rooms is dark. The overlap becomes visible the day the
Hall of Legends guarantor lands.

### Task 2-3: content, schema, and the open-today predicate

`economy.auction.cadenceByTier`, `.strict()` per guard G5, four explicit tier keys so a missing
room fails validation rather than silently never opening. Values exactly as tabled. It sits under
`auction` rather than under `calendar` because cadence is a property of the venue, which is the
whole ruling; `calendar` is now free of the auction entirely.

The `[1, daysPerWeek]` bound on `openDaysOfWeek` is asserted in `schemas.test.ts` rather than as a
Zod refine. A cross-block refine would have to sit on `EconomyConfigSchema` itself, which would
turn it from a `ZodObject` into a `ZodEffects` and change the type every caller sees, for a bound
one test line already covers. **Flagged as a judgement call, not a silent choice.**

**The predicate lives in `calendar.ts`, one implementation, per the ownership guard.** Three new
exports, all pure functions of `(day, economy)`:

- `weekIndex(day, economy)` - `floor((day - 1) / daysPerWeek) + 1`. The other half of a cadence:
  a room that sits fortnightly needs to know WHICH week today is, not just which day. It has to
  live here anyway, because `calendarOwnershipGuard.test.ts` bans `% economy.calendar.daysPerWeek`
  outside this file.
- `isAuctionTierOpen(day, tier, economy)` - today's `dayOfWeek` is in the room's `openDaysOfWeek`
  AND `(weekIndex - 1) % weeksBetween === 0`. Week 1 is an open week for every room, so
  `collector-network` first sits on days 6 and 7 of week 1, never phased later.
- `nextOpenDayForTier(fromDay, tier, economy)` - the first day at or after `fromDay` the room
  sits, searching one full cadence cycle (`daysPerWeek * weeksBetween` days, which always contains
  a sitting for any cadence the schema allows). Returns `number | null`; the `null` is unreachable
  in practice and exists so no caller has to trust that.

`isAuctionDay` is deleted, not deprecated (guard G1).

### Task 4: `calendar.auctionDayOfWeek` retired

Out of `economy.json`, out of `EconomyConfigSchema`'s `calendar` block (and out of that block's
`*DayOfWeek` range refine, now three levers rather than four), out of the block's doc comment,
and into `retiredIdentifiers.test.ts` as **`auctionDayOfWeek`** - matched bare rather than as the
dotted path, so `economy.calendar.auctionDayOfWeek` and any other route to it trips too. Every
reader moved across in the same change: `calendar.ts`'s `isAuctionDay`, `gameStore.ts`'s
`isAuctionDay` computed, `AuctionScreen.vue`'s `auctionDayName` and closed sign, and
`AuctionScreen.test.ts`'s three reads.

### Task 5: the two reserve constants ARE unified, and the ruling on why

**They became one. `auctionRoom.reserveFraction` is retired; `AUCTION_RESERVE_PRICE_FRACTION`
(already 0.6) is the survivor and did not move.** The net effect on the live room is exactly the
signed lever change, 0.55 to 0.6, with one authored number left instead of two.

**Why unification was right rather than merely tidy.** They were not two fractions of two
different things. `bidding.ts`'s `reserveYen` is `anchorValueYen(lot) * AUCTION_RESERVE_PRICE_FRACTION`,
and `anchorValueYen` is `carGuideValueYen`. The live room's `roomReadYen` is
`sheetGuideValueYen(lot.car, ...)`, which `carGuideValueYen` itself returns for a symptomatic car
and degenerates to for an honest one. **Same base, same concept, two numbers.** The visible
symptom: the auction card printed a reserve at 0.6 of the guide and then the room opened bidding
five points below it. That is now impossible by construction.

**Why it did not need room pricing moved into `packages/sim` (the stop condition the doc set).**
Both numbers already live in the same file, `economy.json`. The only obstacle was that
`RoomConfig` was a 1:1 alias of the `AuctionRoomConfig` content block, so deleting a field from
the block deleted it from the machine's tuning. `RoomConfig` is now
`AuctionRoomConfig & { reserveFraction: number }`, assembled in exactly one place by a new
`roomConfigFrom(economy)` in `auctionRoom.ts`, so no caller can pair the room tuning with a second
opinion about the reserve. Four production call sites and five test helpers go through it. Nothing
moved packages; `packages/game` still owns room price formation.

**The direction was a real choice and it went the other way first.** Sim already reads
`economy.auctionRoom.attendanceFeeYenByTier`, so the alternative - delete
`AUCTION_RESERVE_PRICE_FRACTION` and point sim's four readers at `auctionRoom.reserveFraction` -
was available and would have kept `RoomConfig` a clean 1:1. It was rejected: the reserve is an
economic law (GDD 6.5, `economy-bible.md`'s anchor table) that applies to lots which never enter
a live room at all, and `auctionRoom` is documented as the LIVE ROOM'S OWN presentation tuning.
Burying a whole-game seller floor inside a UI-tuning block would have been the wrong home for the
concept. The intersection type is the smaller price.

**The narrowing this causes, stated rather than compensated for.** `clearingFractionFor` draws a
cold room uniformly between the reserve fraction and the turnout band's `clearMin`, so raising the
floor narrows that band by five points and a bargain room is slightly less of a bargain. Entailed
by the ruling. No other lever moved.

Bare `reserveFraction` is deliberately NOT in the retired ledger: `RoomConfig` still carries the
field, it just no longer authors it. The dotted `auctionRoom.reserveFraction` is banned instead.

### Task 6: listing fees on `CarLedger`

`CarLedgerSchema` gains `listingFeesYen` (default 0), posted at the existing charge site in
`resolveSetForSale` - the same `updateCarLedger` primitive every other per-car spend already uses,
no new mechanism. It **accumulates**: a re-list on a dearer channel pays again and adds again,
because that is what actually happened to the bank.

**A free channel posts nothing at all.** `shopFront`/`tradeNetwork` are 0, and writing a 0 would
mint a ledger entry for a car that has none - turning a dev-granted car's honest "unknown
purchase" into a stored record that says the same thing at more cost. This matches the
zero-attendance-fee silent-no-op convention already in `bidding.ts`.

Read sites updated: `resolveSellViaWalkIn`'s `profitYen`, `gameStore`'s `SaleResultView` and its
three ledger sums, `CarDetailScreen.vue`'s finance panel (a row that only renders when a fee was
actually paid) and `SaleCompleteModal.vue` (same). `SAVE_VERSION` 50 -> **51**, additive case, no
`MIGRATIONS[50]` entry (directive 19: nothing to protect).

**One deliberate exclusion, flagged because it is a judgement call the doc did not make.**
`requirements.ts`'s `evaluateBudgetCap` still counts purchase + repairs + parts and NOT listing
fees. A budget cap is a restoration budget for a car being built to order, and a car built for a
client is never advertised; folding sale costs in would quietly tighten every authored mission cap
without anyone approving the new numbers, which directive 22 reserves. Documented in the function's
own doc comment so the omission reads as a decision rather than an oversight.

**The other half of the ruling is asserted, not assumed.** A new test proves
`resolveHireMachineLine` charges the day, logs `machine-hired`, and leaves `carLedgers` empty.

### Task 7: the auction screen

The single global closed sign is gone. In its place:

- A line at the top naming who is sitting: "Open today: Fujimi Auto Auction." (venue names, via
  the existing `venueLabelFor`, never the raw tier slug).
- Per room, three states rather than two: locked (the existing guarantor copy, untouched), shut
  today ("Shutters down. This one sits again tomorrow." / "on Saturday" / "a week on Saturday"),
  or open (its real board).
- A shut room shows no lots and no inspect control - you cannot walk into a yard nobody is
  standing in.
- The whole-house closed sign survives as a fallback and is unreachable under the shipped cadence,
  since every day of the week belongs to some room. It is kept because cadence is content and a
  tuned cadence could leave a gap.

**"a week on Saturday" is a judgement call.** `nextOpenPhraseFor` says "tomorrow" for one day
ahead, "on `Weekday`" inside the coming week, and "a week on `Weekday`" beyond it, which is what
the collector network's fortnightly gap actually needs. It is correct British idiom and it is the
only phrasing that distinguishes the two Saturdays. Flagged in case the maintainer would rather
have a day count.

**Cadence and access stayed separate mechanisms, as instructed.** `openAuctionTiers` filters
`unlockedAuctionTiers` by `isAuctionTierOpen`: the guarantor gate answers whether you may walk in,
the cadence answers whether anyone is there. Neither knows about the other.

**No gate was added anywhere that stops a player attending more than one room in a day.** Searched
for and confirmed absent: `resolveAttendAuction`'s per-tier admission is charged once per tier per
day and was not touched.

### Task 8: the "machine line" prose sweep

Swept out of every source comment under `packages/*/src` (9 files) and out of the generated
document's renderer, which was then regenerated. "Machine-line hire" is now "Machine-shop hire";
"its group's machine line" is now "its group's machinery"; "hire the line" is now "book the
machine-shop hire"; "machine-line gate" is now "machine-shop gate". The `'machine-line'`
`blockedReason` VALUE is untouched, per the instruction that this binds writing, not identifiers.

**The one place the banned phrasing still reaches a human is `dayLogFormat.ts`, which renders that
raw reason token to the player as `Job <id> blocked (machine-line)`.** That was already a known
defect (a developer line, not a player line) and is recorded in `TODO.md` alongside the silent-
failure design question it belongs to. Not fixed here: the copy depends on that design decision.

### Task 9: tests and re-derivation

Every test the doc asked for, plus what the changes forced.

**New, in `packages/sim/tests/calendar.test.ts`** (a new `describe`, plus `weekIndex` coverage in
the existing one). The tabled cadence is written out **literally** rather than recomputed from the
same content the implementation reads, so this block is a genuine pin:

- Each room open on exactly its tabled days over a 28-day span: `local-yard` on
  1/3/5/7/8/10/12/14/15/17/19/21/22/24/26/28, `regional` on 2/4/9/11/16/18/23/25, `premium` on
  6/13/20/27, `collector-network` on 6/7/20/21.
- `collector-network` opens in weeks 1 and 3 and not 2 or 4, and week 1 is an open week.
- **Day 1 is an auction day at the local yard, naming the day-1 tutorial bug it closes.**
- **`premium` and `collector-network` are BOTH open on day 6 of an open week**, asserted rather
  than avoided, plus the negative case (day 13: premium sits alone) so the test cannot pass
  vacuously.
- Some room is open every day of a four-week span.
- `nextOpenDayForTier` across a skipped week (day 8 -> day 20) and on a day already open.

**New, in `packages/sim/tests/selling.test.ts`:** the fee posts to the ledger by exactly the fee
charged (cash out and ledger in are the same figure); it accumulates across a re-list; a free
channel mints nothing; the reported profit moves by exactly the fee and the sale price does not;
and machine-shop hire never touches a car ledger.

**New, in `packages/game/src/screens/AuctionScreen.test.ts`:** day 1 renders the local yard's
board and the tutorial's own `inspect-visit-local-yard` anchor; a shut room shows a plain-words
"sits again tomorrow" line, no board, and no inspect control.

**Re-derived pins, old -> new:**

| pin | old | new |
| --- | --- | --- |
| `economyApprovalGate.test.ts` `economy.json` hash | `04131e5c20274e6606ef03a74ab7380e92584614d3165af5d85ce4c3c01118c5` | **`2699aa1f66f2841eb305a35dfc7237532b3d435252cdca475376238d606a3052`** |
| `advanceDay.test.ts` job-loop golden master | `8cf486eb` | **`3ff6dc44`** |
| `advanceDay.test.ts` acquisition-to-sale golden master | `634d4493` | **unmoved** |
| `saveCodec.ts` `SAVE_VERSION` (7 canary assertions) | 50 | **51** |
| `auctionRoom.test.ts` hammer leader, 3 seeded flows | `Endo` | **`Mrs. Sakaki`** |
| `auctionRoom.test.ts` packed-room 5th drop line | `Mrs. Sakaki closes the folder.` | **`Endo closes the folder.`** |
| `schemas.test.ts` `auctionRoom.reserveFraction` | `0.55` | field absent (asserted absent) |
| `worked-example-two-cars.md` | generated | regenerated (`WORKED_EXAMPLE_WRITE=1`), 60 lines changed |

**The two golden hashes split, and the split is the evidence that this is a shape change and not a
behavioural one.** `hashState` serializes the WHOLE state, so a new `CarLedger` key moves the hash
of any script still holding a ledger at the end. The job-loop script finishes still owning its
car, so its ledger now carries `listingFeesYen: 0` and the hash moved. The acquisition-to-sale
script SELLS its car, and `resolveSellViaWalkIn` deletes the ledger with it, so its final state has
no ledger at all and its hash is untouched. Nothing in this sprint changes what `advanceDay` does:
cadence is read by the UI, not by the day loop; the reserve fraction is read by the live room and
by lot pricing, neither of which these scripts exercise; and the listing fee is charged by
`resolveSetForSale`, which neither script calls on a paid channel.

**I got this wrong first and the full-project run is what caught it.** This section originally
recorded both hashes as unmoved, on the reasoning above about behaviour, having not yet run the
whole sim project. That reasoning was right and the conclusion was wrong, because it ignored
serialization shape. Re-derived from a real run, re-pinned, and `advanceDay.test.ts` re-run twice
afterwards (15 passed both times) to confirm the new hash is stable; the file's own
same-script-twice determinism test passes alongside it.

The economy hash was re-derived once and the value re-run to confirm stability.

**The auction-room dealer names are the one re-derivation that needs its reasoning stated.** The
reserve is the opening bid, so raising it from 0.55 to 0.6 of the read means the room climbs one
fewer rung to reach its clearing price, and `bidderCursor` lands on a different name at the
hammer. Every structural assertion in those three tests still passes untouched: the board still
settles on the last rung at or under the clearing price, one more rung would still clear it, and
the room still thins to exactly one dealer. `runDrops` never drops the leader, so the 5th drop
line swapped with it. Dealers are documented as pure flavour with no bearing on the numbers, and
that held.

### Failing tests, and which case each was (directive 17)

**Every failure this sprint hit was case (a): the implementation intentionally changed what is
correct, and the test was updated to assert the new correct behaviour. None was loosened.**

1. `AuctionScreen.test.ts`'s "the auction house is closed outside auction day" asserted the day-1
   shutters this sprint exists to remove. Rewritten into two tests: day 1 is open at the local
   yard, and a genuinely shut room says when it sits again. `warpToCatalog` was rewritten from
   "warp until `isAuctionDay`" to "warp until some lot's room is open" - which now advances
   nothing at all, since a fresh career has only `local-yard` unlocked and it sits on day 1.
2. `schemas.test.ts`'s `reserveFraction` 0.55 pin: the field is retired, so the assertion is now
   that it is absent.
3. `economyApprovalGate.test.ts`'s hash: directive 22's own re-pin-on-approved-change path, in the
   same change as the recorded approval, with the ledger comment naming all three content changes.
4. `gameState.test.ts` and `saveCodec.test.ts`'s ledger round-trips: the schema gained a field.
   The round-trip fixture uses a non-zero `listingFeesYen` (4,500) rather than 0, so it actually
   exercises the new field instead of passing on a default.
5. The seven `SAVE_VERSION` canaries: the version bumped. Two of them were titled "SAVE_VERSION is
   48" while asserting 50, which had been stale for two bumps; retitled to "is current".
6. `auctionRoom.test.ts`'s three leader-name pins and one drop line: seeded outcomes of an opening
   bid that intentionally moved. Reasoning above.
7. `workedExample.test.ts`'s decomposition: `categoryTotal('listing')` had to come OUT of the
   add-back, because listing fees now sit inside `netYen` via the car ledger. Leaving it would
   have double-counted them, and the reconciliation is asserted to the yen with no tolerance, so
   it caught this immediately. The per-car identity test was widened from "the CarLedger triple"
   to every ledger line, and now also asserts the ledger recorded exactly the fee charged.
8. `bidding.test.ts`'s two acquisition-ledger fixtures and `advanceDay.test.ts`'s job-loop golden
   hash: the schema gained a field, and `hashState` serializes the whole state. Reasoning and
   re-derivation in the table above.
9. Two guard tests caught this sprint's own new prose, which is the outcome they exist for and
   both were resolved by rewording rather than by loosening the guard.
   `retiredIdentifiers.test.ts` tripped on comments that named the retired identifiers while
   explaining their retirement (the same word-boundary-vs-prose tension `sprint149.md` recorded);
   the comments now say "the retired room-local copy" and "the retired single global auction day".
   `commentHygieneGuard.test.ts` tripped on 15 comments carrying dates and maintainer
   attributions; every one now documents the rule rather than who ruled it and when. Both were
   genuine finds: the second in particular caught process narrative going into eight files.

### Checks, in the specified order, once each

1. `pnpm typecheck` (required by the directive 20 carve-out: this retires a lever and reshapes
   `CarLedger`) - **content, sim and game (`vue-tsc`) all clean.** Run four times in total across
   implementation, deliberately: it is whole-program and it is what named every one of the ~40
   call sites the two shape changes touched, in three tranches (content, then sim, then game).
   The final run is clean.
2. `pnpm test --project content` - **542 passed (25 files)**.
3. `pnpm test --project game` - **835 passed (62 files)**.
4. `pnpm test --project sim` - **1943 passed (73 files)**, whole project. The first run found 3
   failures in 2 files (`bidding.test.ts`'s two ledger fixtures and `advanceDay.test.ts`'s job-loop
   golden hash); both were fixed and the whole project re-run clean.

**The doc's warning about a hand-picked file list was justified twice over.** Neither
`advanceDay.test.ts` nor `workedExample.test.ts` would have appeared on any reasonable named list
for "auction cadence, one reserve fraction, listing fees on the ledger" - and both caught real
consequences of the `CarLedger` reshape that the narrower runs missed.

Single files run during implementation, narrowest-question-once: `saveCodec.test.ts`,
`auctionRoom.test.ts` (twice, to re-derive the two seeded pins in turn),
`workedExample.test.ts` (twice: once to confirm the reconciliation, once with
`WORKED_EXAMPLE_WRITE=1` to regenerate the document), and
`advanceDay.test.ts`+`bidding.test.ts` (then `advanceDay.test.ts` once more, to confirm the
re-pinned hash is stable).

### What this sprint deliberately did not build

- **A gate preventing attendance at more than one room a day.** Explicitly ruled out; none added.
- **The periodic financial summary.** Recorded in `TODO.md` as needing design, with the note that
  the calendar now has both a week and a month boundary to hang it on.
- **Room price formation moved into `packages/sim`.** Not needed and not done.
- **Anything touching a taste ceiling, a channel fee, or which buyers a channel draws.** The
  pending listing-channel design owns all of that and this sprint did not pre-empt it.
- **A fix for `collector-network`'s unreachability.** Reported, not fixed, as instructed.

### One thing for the maintainer

The cadence you flagged as possibly having too few overlaps bites hardest at the START of a
career, which may not have been obvious when it was tabled: a day-1 player has only `local-yard`
unlocked, and it sits four days in seven, so **three days a week a brand-new player has no auction
at all.** It shipped as signed and it is not a defect, but it is recorded in `TODO.md` as an open
question worth a look after a week of play. Changing it is a lever move under directive 22.
