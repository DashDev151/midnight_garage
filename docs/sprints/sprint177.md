# Sprint 177: standing moves the band

**Arc:** `docs/sprints/scene-standing-arc.md`. Step 3.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, section 5.

The mechanism, without the means of earning it. Standing is set by hand in tests and by the dev
console here; sprint 178 makes it earnable.

## Goal

**Being known in a scene changes what that scene pays you, and changes nothing for anybody else.**

## The insertion point, verified

`valuation.ts`'s `channelTasteMultiplier` is the single place a taste band is built:

```
low       = 1 - tasteSpread                  = 0.88
normalTop = 1 + tasteSpread                  = 1.12
ceiling > normalTop  ->  low + (ceiling - low) * score
ceiling <= normalTop ->  min(low + (normalTop - low) * score, ceiling)
```

**A stage moves `low`, `ceiling`, or both, for one scene's buyers only.** Nothing else in the
pricing path changes, and every other scene continues to price exactly as it does today.

## The stages

| stage | that scene's band | first-pass, tunable |
| --- | --- | --- |
| **Known** | floor 0.88 to **0.92** | |
| **Respected** | floor to **0.95**, ceiling 1.12 to **1.17** | 1.17 is exactly the magazine and weekend-meet ceiling, so a Respected scene pays magazine money off the shop front |
| **The Shop** | ceiling to **1.25** | past every channel that exists |

### Three rules that keep it honest

**Anything above 1.12 is matched-only.** A raised ceiling is never reachable by a mismatched car.
Note this is already half-true by construction: with `low + (ceiling - low) * score`, only a score of
1.0 reaches the ceiling at all. The rule is about not letting a raised ceiling leak into
non-matched sales.

**Ceilings take the max, never stack.** For that scene's buyers the effective ceiling is
`max(channelTasteCeiling, sceneStandingCeiling)`. **Stacking would compound**: a Respected scene in
the magazine would otherwise reach 1.17 + 0.05, and The Shop would run away entirely.

**The floor stops at 0.95, never 1.0.** Respect is not gullibility. The design's other half, that a
specialised car is also somebody's WRONG car, survives only because the floor rises partway.

## Reuse analysis (directive 16)

| concern | what already does it |
| --- | --- |
| Building a taste band | `channelTasteMultiplier`, the one place it happens. It gains a per-scene floor and ceiling rather than a second function |
| Channel ceilings | `sellingChannels[*].tasteCeiling`, unchanged. Standing takes the max against it |
| Matched detection | `channelBuyerTaste >= 1`, already live in `resolveSellViaWalkIn` and in the `matchedOnly` gate |
| Per-buyer pricing | `valuateCarForBuyer` and `valuateCarForBuyerViaChannel`, both already routing through the multiplier |

**Genuinely new:** a per-scene standing record on `GameState`, and the floor/ceiling lookup from it.

## The work

1. **`GameState` carries a stage per scene.** Six scenes, one of `none | known | respected | shop`.
   Dexie version bump, no migration (directive 19).
2. **`channelTasteMultiplier` takes the scene's band.** Floor and ceiling resolved from the stage,
   ceiling maxed against the channel's own, matched-only above 1.12.
3. **Every call site passes it.** `valuateCarForBuyer`, `valuateCarForBuyerViaChannel`,
   `channelBuyerTaste`, and the bidding path that shares them.
4. **A dev-console control** to set standing, so 178's earn event has something already proven to
   drive.

## The interaction to check before building

**Bidding shares this pricing path.** `valuateCarForBuyer` is used as an AI competitor's true value
at auction as well as for player sale offers. **Scene standing must not change what an AI bidder
pays** — your reputation with the Show Crowd cannot make a rival bid more at the block. Establish
which call sites are the player selling and which are the world valuing, and apply standing only to
the first. Say which is which in the report.

## Levers (directive 22)

**Not approved. Seven values:** the three floors (0.92, 0.95), the two ceilings (1.17, 1.25), and
whatever thresholds sprint 178 uses to award the stages. All are first-pass in the design and
explicitly tunable.

## Definition of done

1. A scene at Known, Respected or The Shop prices that scene's buyers differently, and no other
   scene moves at all.
2. Ceilings max, never stack, against channel ceilings.
3. No raised ceiling is reachable by a mismatched car.
4. An AI bidder is unaffected by player standing.
5. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately not here

Earning it, the ledger, word of mouth, commissions, operations. Standing is set by hand.

## Exit

_To be completed at the end of the sprint._
