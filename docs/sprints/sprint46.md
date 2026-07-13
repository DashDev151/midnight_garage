# Sprint 46 - Honest auctions: the final-call fix and named outcomes

**Source:** playtest 2026-07-13 pass 2 (`docs/playtest-notes-2026-07-13-pass2.md`), items 10, 11,
12. Opens the **Legibility & Trust arc (Sprints 46-52)**.

## Confirmed root causes (code discovery, 2026-07-13)

- **Item 11 (final call closes a day late):** the sim is correct; the badge lies. The hammer
  (`bidding.ts:441-464`) fires on a quiet night when `quietDays >= 3` OR `day >= expiresOnDay`
  (with `day` still pre-increment). The badge (`gameStore.ts:986-994`) computes
  `quietNightsLeft = threshold - quietDays` (correct, aligns exactly) but
  `backstopNightsLeft = expiresOnDay - day` (off by one - should be `expiresOnDay - day + 1`).
  A lot near its expiry backstop therefore shows "final call" one full day before the backstop
  can actually fire, which is exactly the reported repro (led lots on final call surviving a
  quiet night, closing the following day). The player's other fear case (a) is confirmed correct
  behavior: `resolvePlaceBid` resets `quietDays` to 0 (`bidding.ts:407-413`), so a fresh player
  bid always buys at least one more night.
- **Item 10:** "dealer leads at X" is invented copy - `leadingBidder` is just
  `'player' | 'rival'` (`content/src/auction.ts:55`); no dealer identity exists anywhere.
- **Item 12:** `auction-bid-won/-lost`, `lot-bought-out`, `auction-outbid` log entries carry only
  `lotId`; the lot is removed from state in the same resolution call, so a render-time lookup is
  impossible by design. The fix must stamp display data onto the entry at creation.

## Reuse analysis (directive 16)

**New mechanisms:**

- `modelId` + `year` fields on the four per-lot auction `DayLogEntry` variants.
- The one-line badge arithmetic fix.

**Existing mechanisms to reuse:**

- `dayLogFormat.ts`'s existing `resolveModelName` resolver (already used by `market-heat-shift`
  and `offer-received`) renders the display name from `modelId` - no new resolver.
- `DayLog` is ephemeral, never persisted (`saveCodec.ts` never references it - Sprint 45
  precedent), so the schema additions carry zero save-migration weight.
- The badge fix edits the existing `closeLabel` computation in place - no new close-state system.

## Decisions

1. **Fix the badge, not the hammer.** The sim's close behavior is deterministic, tested, and
   balance-relevant; the UI made a promise the sim never did. Change
   `backstopNightsLeft` to `expiresOnDay - day + 1`. Zero sim change, zero golden-hash churn.
2. **"dealer leads at ¥X" becomes "leading bid ¥X"** (`AuctionScreen.vue:101-106`). No fictional
   entity implied.
3. **Log entries name the car.** `auction-bid-won`, `auction-bid-lost`, `lot-bought-out`, and
   `auction-outbid` gain `modelId: string` and `year: number`, stamped from `lot.car` at entry
   creation in `bidding.ts`. Rendered copy: "Won the 1984 Honda City E (AA) for ¥38,170" /
   "Lost the 1995 Suzuki Wagon R (CT21S) (went for ¥45,410)" / "Outbid overnight on the ... -
   now ¥45,410". The "(AA)" trim comes free from the model display name.

## Tasks

1. Content: extend the four `DayLogEntry` variants (+ schema tests, incl. the
   one-entry-per-event-type `DayLog` fixture).
2. Sim: stamp `modelId`/`year` at each entry-creation site in `bidding.ts`; regression tests.
3. Game: badge backstop fix + a store-level regression test reproducing the playtest scenario
   exactly (a lot at `day === expiresOnDay - 1` with active bidding must NOT show final call;
   at `day === expiresOnDay` it must show it AND hammer that night). Rewrite the four
   `dayLogFormat.ts` cases + tests. Copy change for "leading bid".
4. Verification: full gate; confirm golden hashes in `advanceDay.test.ts` are untouched by the
   badge fix (log-entry additions will re-pin them - shape change only, disclose as such).

## Definition of done

- The playtest repro is a permanent regression test and passes: a final-call badge is never shown
  on a night the lot cannot close, under both the quiet-days and backstop arms.
- No auction log line ever shows a raw lot id; every one names year + model.
- "dealer" appears nowhere in player copy.
- Full gate green; sim behavior byte-identical except the added log fields.

## Exit

Implemented directly. All four tasks done.

**Files touched:**

- `packages/content/src/gameState.ts` - `modelId`/`year` added to `auction-outbid`,
  `auction-bid-won`, `auction-bid-lost`, `lot-bought-out` (matching `CarInstance.year`'s own
  `z.number().int()`, no stricter).
- `packages/sim/src/bidding.ts` - all four entry-creation sites stamp `lot.car.modelId`/
  `lot.car.year`.
- `packages/game/src/stores/gameStore.ts` - `auctionCloseLabel`'s backstop arm:
  `expiresOnDay - day` -> `expiresOnDay - day + 1`, matching the quiet-days arm's own implicit
  offset.
- `packages/game/src/screens/AuctionScreen.vue` - `bidStateLabel`'s "dealer leads" -> "leading
  bid" (no fictional entity implied; `leadingBidder` was always just `'player' | 'rival'`).
- `packages/game/src/utils/dayLogFormat.ts` - the four cases rewritten to name the car
  ("Won the 1984 Honda City E for Y38,170", etc.) instead of the raw lot id.
- Test fixtures updated for the new required fields: `packages/content/tests/gameState.test.ts`,
  `packages/sim/tests/bidding.test.ts` (two `toEqual` literals), `packages/game/src/utils/
  dayLogFormat.test.ts` (SAMPLES fixture + a new won/lost/bought-out naming test).
- New regression test: `packages/game/src/screens/AuctionScreen.test.ts` - reproduces the exact
  playtest scenario (a lot one day before its expiry backstop must NOT show "final call"; the
  day the backstop actually fires it must).

**Verification:** `pnpm typecheck` (3 packages) clean, `pnpm lint` clean, `pnpm format` clean,
`pnpm test` (content+sim+game) **933/933 pass**. Golden hashes in `advanceDay.test.ts` needed
NO re-pin - confirmed why: `DayLog` is ephemeral (never persisted, `saveCodec.ts` never
references it - Sprint 45 precedent) and `hashState()` hashes `GameState`, not the log, so
adding fields to `DayLogEntry` variants has zero effect on the hashed shape. Balance harness
skipped per instruction (no sim-behavior change - the badge fix and log copy are display-only;
`bidding.ts`'s actual resolution logic, cash flow, and RNG draws are untouched).
