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

### The rules that keep it honest

**"Anything above 1.12 is matched-only" is toothless as written, and needs a decision before build.**

MATCHED in the code is `channelBuyerTaste >= 1.0`, a test on the OUTPUT price. Any payment above 1.12
trivially satisfies it, so the rule enforces nothing. Worse, because standing raises the FLOOR, the
bar for being matched at all falls as standing rises:

| stage | band | score needed to be "matched" |
| --- | --- | ---: |
| none | 0.88 to 1.12 | **0.500** |
| Known | 0.92 to 1.12 | 0.400 |
| Respected | 0.95 to 1.17 | 0.227 |
| The Shop | 0.95 to 1.25 | **0.167** |

**That is a compounding loop the design did not intend**: more standing makes matching easier, and
matching is what earns standing. And concretely, at The Shop a score-0.6 car - a fairly WRONG car -
prices at `0.95 + 0.30 x 0.6 = 1.13`, above the old ceiling, which is exactly what the rule was
written to prevent.

**The fix for both is one change: define matched on the SCORE, not on the price.**
`normalizedTasteScore >= 0.5` is the score that yields 1.0 at the standard band, so it means the
same thing at every stage and cannot drift. **This is a lever and a behaviour change**: it also
governs the two `matchedOnly` channels and `reputation.matchedSaleRepBonus` today, so it must be
approved rather than assumed.

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

**Not approved:**

1. The floors (0.92 at Known, 0.95 at Respected) and the ceilings (1.17 at Respected, 1.25 at The
   Shop). First-pass in the design and explicitly tunable.
2. **The matched definition**, per the analysis above: whether it moves from `taste >= 1.0` to
   `normalizedTasteScore >= 0.5`. This governs the two `matchedOnly` channels and
   `matchedSaleRepBonus` today, so it changes live behaviour and is the one decision this sprint
   cannot start without.

## Definition of done

1. A scene at Known, Respected or The Shop prices that scene's buyers differently, and no other
   scene moves at all.
2. Ceilings max, never stack, against channel ceilings.
3. No raised ceiling is reachable by a mismatched car, **and the test for that does not get easier
   as standing rises**.
4. An AI bidder is unaffected by player standing.
5. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately not here

Earning it, the ledger, word of mouth, commissions, operations. Standing is set by hand.

## Exit

_To be completed at the end of the sprint._
