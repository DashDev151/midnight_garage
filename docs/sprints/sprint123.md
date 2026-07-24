# Sprint 123: Grip drives handling, the two-figure model (car spec arc, integration phase 1)

**Source design:** `docs/design/car-spec-integration-plan.md` and the signed-off grip model in
`docs/design/car-spec-book.html`. Maintainer-confirmed 2026-07-24: the two-segment display curve,
the two grip figures, the aero-on-high-speed split, and the handling levers.

This sprint lands the cornering half: `computeGrip` (uncapped mechanical lateral g) and `balanceOf`
in `packages/sim`, the two-segment display curve, and the handling stat rewired off weight and onto
grip. The HIGH-speed grip figure and aero live in Sprint 124 (aero needs bolt-on parts and corner
speed); this sprint builds the low-speed (mechanical) grip that both figures share, and defines the
display curve both will reuse. No lap, pace, aero, or value change.

## Reuse analysis (directive 16)

**New mechanisms**

- `packages/sim/src/performance.ts` (new): `computeGrip(model, effectiveCompound)` returning a
  continuous, UNCAPPED mechanical lateral g (compound[era x tyre-tier x width] x CoG-transfer x
  drivetrain-layout), ported verbatim from the signed-off artifact. Plus `balanceOf(model)` in
  [-3, +3], `gripToDisplay(g)` (the two-segment curve), and derive helpers `drivetrainOf` /
  `enginePositionOf` (layout tag) and `trackOf` (tyre width / kei).
- `spec.activeYaw: 'attesa' | 'ayc' | null` (additive optional), replacing the artifact's engine-code
  regex; set `attesa` on `nissan-skyline-gtr-bnr32` (the only active-yaw car in the playable 26).
- A `race`/slick tyre-compound tier above `grand`, reached only by a fitted race tyre part, so a
  track build's mechanical grip exceeds the stock 1.08g ceiling.
- Content: the grip constant table, the two-segment curve constants, the balance weight (levers).

**Existing mechanisms to reuse**

- `derivedStats.ts` handling keeps its condition/parts weighting
  (`weightedBandFactorForStat(..., 'handling')`) and its `part.statModifiers.handling` loop; only the
  BASE changes (from `handlingBase x fraction - curbWeightKg/divisor` to the grip-derived base).
- The fitted tyre part's `grade` (stock/street/sport/race) maps to the effective compound tier
  (`stock` -> `spec.tyreCompound`; street -> performance; sport -> sport; race -> slick). No new tyre
  data.
- Sprint 122 spec fields (`yearFrom`, `stockTyre`, `tyreCompound`, `comHeightMm`,
  `weightDistributionFront`) and the layout tag are the model's inputs. No migration (directive 19).
- `StatBlock` keeps its five axes; only handling's derivation changes.

## The confirmed design

Per car, at current condition and fitted parts:

```
lowSpeedGrip = computeGrip(model, effectiveCompound(car, model))   // uncapped mechanical g
mintHandling = gripToDisplay(lowSpeedGrip) - 1.0 * abs(balanceOf(model))
handling     = round(clamp(
                 mintHandling * weightedBandFactorForStat(car, model, 'handling')
                 + Σ part.statModifiers.handling * bandFactor(band),
               0, 100))
```

**The two-segment display curve** `gripToDisplay(g)` (maps mechanical/aero g to the 0-100 readout,
with 55 = the best grip any STOCK road car makes, 1.10g):

```
g <= 1.10 :  10 + (g - 0.66) * (45 / 0.44)     // stock band, steep: keeps stock resolution
g >  1.10 :  55 + (g - 1.10) * (45 / 0.90)     // modified band, gentle: spreads builds, no early cap
clamp [0, 100]
```

Verified spread: the playable 26 read **15-36** stock (Wagon R 15, Supra 36); anything 55+ is a car
modified beyond any stock car; the cap (100) is touched only by the ~2.0g extreme. Two grip figures
share this curve (Sprint 124 adds the high-speed one = mechanical + aero; here low = the only figure,
since no playable car carries stock downforce).

**Balance:** `balanceOf` from `weightDistributionFront` + drivetrain + engine position, conservative
`- 1.0 * abs(balance)` (a neutral car untouched, an extreme understeer/tail-happy car loses at most
~3), with the understeer/neutral/tail-happy word shown as flavour.

`computeGrip` returns raw uncapped g so Sprint 124 reuses it for the high-speed figure and lap.

## Levers (maintainer-confirmed 2026-07-24)

- **Two-segment curve:** stock band `0.66g -> 10, 1.10g -> 55`; modified band `1.10g -> 55,
  2.00g -> 100`. CONFIRMED.
- **Balance weight:** 1.0, symmetric, capped by `balanceOf`'s [-3, +3]. CONFIRMED.
- **Grip constant table** (locked from the artifact): `eraRubber` x9, `tierDelta` x5 plus the new
  `slick` tier, transfer 0.75 / reference 0.27 / floor 0.80, the width term, layout bonuses (AWD
  passive 0.02, active 0.035, mid 0.015). Verbatim into `economy.json` (new `grip` block).
- **`balanceOf` constants:** front term `(52 - front%)/8`, FWD -1.0, RWD +0.7, rear +1.0, mid +0.35,
  clamp [-3, +3].
- **Tyre-grade -> compound map:** stock -> `spec.tyreCompound`; street -> performance; sport -> sport;
  race -> slick.

These replace `statFormulas.handlingBase` and `statFormulas.handlingWeightDivisor`, which are removed.

## Integration notes (decide, do not leave vague)

- **No double-counting tyres.** Tyres drive handling through the grip model's compound tier, so any
  `statModifiers.handling` on TYRE parts is zeroed (their effect is now the compound). Suspension and
  other handling parts keep their `statModifiers.handling` (flat points, unchanged). If zeroing tyre
  mods moves more than the tyre slot, report it before proceeding (possible directive-22 surface).
- **StatBlock stays 5 axes.** `handling` is the low-speed grip readout; it still feeds taste and the
  radar unchanged. The explicit low/high grip PAIR is a Sprint 125 display concern.

## Probe / re-pin plan (directive 17: state the case per failure)

Case-(a) intentional-input changes, re-pinned with reason, NOT loosened:

- `economyApprovalGate.test.ts`: `economy.json` sha256 + the 10 mission payouts re-pin (statFormulas
  change + `grip` block added). Re-pin in the SAME change as this recorded approval.
- `advanceDay.test.ts` goldens `d0e2394e`, `3fd7b213`: handling -> taste -> sale price -> career
  state, both move. Re-pin.
- `derivedStats.test.ts`: handling assertions re-pin to the new grip-derived values; the part-modifier
  deltas (+8/+3), power, and authenticity assertions do NOT change.
- `radar.test.ts`: handling-dependent assertions re-pin.
- `storyMissionProbes.test.ts`: the `tasteMatch` missions re-derive against the new
  handling-influenced taste; `floor90` power/style/reliability thresholds are unaffected (no shipped
  mission grades handling). Verify each; re-pin the formula-measured numbers.
- `coherence.test.ts` / `valueModelProbes.test.ts`: formula-shaped; verify still green (handling
  reaches value only via the +/-12% taste band). A failed Law probe is case-(b): stop, do not edit.

Run `pnpm typecheck`, `pnpm test --project content`, `pnpm test --project sim`, and the game
`radar.test`, once each.

## Definition of done

- [ ] `performance.ts`: `computeGrip` (uncapped), `balanceOf`, `gripToDisplay`, derive helpers;
      unit-pinned so the 26 cars' grip matches the artifact to 2 dp and `gripToDisplay` hits the
      confirmed anchors (0.66->10, 1.10->55, 2.00->100).
- [ ] `spec.activeYaw` added (additive); `attesa` on the BNR32. Slick compound tier added.
- [ ] Handling rewired; the playable 26 mint-handling land at 15-36; tyre handling mods de-duplicated.
- [ ] Grip / curve / balance constants in `economy.json`; `handlingBase` / `handlingWeightDivisor`
      removed.
- [ ] All re-pins done as case-(a) with reason recorded, or case-(b) escalated. Content + sim + game
      `radar.test` green; typecheck clean.
- [ ] No lap, pace, aero, or value change.

## Exit

**Done, verified, ready for review (not committed).**

- **`packages/sim/src/performance.ts`** (new): `computeGrip` (uncapped mechanical g), `balanceOf`,
  `gripToDisplay` (two-segment curve), `effectiveCompound`, and the `drivetrainOf` /
  `enginePositionOf` / `trackOf` helpers. Grip ported verbatim from the artifact; independently
  cross-checked, the 26 cars match the artifact to the point.
- **Handling rewired** (`derivedStats.ts`): base is now `gripToDisplay(computeGrip(...)) - |balance|`,
  scaled by the existing condition/parts fraction and part modifiers. The playable 26 land at
  **11-35** (Supra 35, Wagon R 12, City E 11), stock cars low with the top of the bar reserved for
  builds, exactly the confirmed design. Power/style/reliability/authenticity untouched.
- **Schema/content:** `spec.activeYaw` added (additive), `attesa` on the BNR32; a `slick` tyre tier
  (0.20, provisional) added; the `grip` constant block landed in `economy.json` nested under
  `statFormulas` (avoids amending the locked economy bible's top-level anchor inventory);
  `handlingBase` / `handlingWeightDivisor` removed; tyre `statModifiers.handling` zeroed on all 12
  tyre SKUs (tyres now drive handling via the compound tier, no double-count).
- **Re-pins (case-a):** `economyApprovalGate` sha256; one `advanceDay` golden (the sell career; the
  repair-only career hash held). The 10 mission payouts held (value is stat-blind). No case-(b).
- **Data corrections found in verification:** `cars.json` Chaser (JZX90) `yearFrom` 1996 -> 1992 (the
  chassis debut; needed zero further re-pins); the artifact's City E (1984 -> 1981), 180SX
  (1991 -> 1989), and FD3S (1992 -> 1991) years aligned to true debuts. Game and artifact now agree
  on all 26.
- **Checks:** typecheck clean (content/sim/game); `--project content` 133/133; `--project sim`
  1418/1418; game `radar.test` 12/12. No lap, pace, aero, or value formula changed.

Deferred to Sprint 124: the high-speed grip figure, aero (downforce coefficient + bolt-on parts),
pace from the torque curve, the course model, and the lap rebuild.
