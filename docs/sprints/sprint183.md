# Sprint 183: the ladder was measured against a lie

**Status: PLANNED. Nothing implemented. Blocked on sprint 182.**

## Goal

Retune the scene-standing ladder against a definition of MATCHED that means something. **Every
number in it was calibrated when 94 per cent of untouched cars matched a scene**, so a threshold of
"3 matched deliveries" meant "sell three cars to anybody" rather than "build three cars somebody
wanted". Sprint 182 changes that; this sprint makes the ladder honest about it.

## This sprint measures BEFORE it proposes, and that ordering is the point

Directive 22 requires every lever value to be signed by name before implementation, and **no
honest value for any of these can be chosen before sprint 182 has been measured**. So this sprint
runs in two halves with a hard stop between them:

**Half one, measurement, needs no approval.** Re-run the three probes from sprint 182 against the
shipped post-182 content and answer, in numbers:

1. How often does a matched delivery actually happen now, per scene, across a realistic run?
2. How long does a player take to reach 3 and then 10 matched deliveries to one scene?
3. What share of deliveries can a player concentrate into one scene, which is what the rolling
   window's share cap prices?
4. Does the taste band's effect on price survive the change, or is it still swamped by parts bills?
   (The sprint 181 acceptance test found the confound and could not answer it.)

**Half one ends by tabling numbers to the maintainer. Implementation does not begin until they are
signed.** If half one shows the existing values are still right, that is a valid outcome and the
sprint closes without moving a lever.

## Reuse analysis (directive 16)

**No new mechanism at all.** Every system this sprint touches was built in sprints 177 to 179 and
works. This is a calibration pass plus a measurement, and the only code that could change is a
probe test.

**Existing mechanisms, and what each one's calibration now rests on:**

- `economy.sceneStandingProgress.knownDeliveries` / `respectedDeliveries` (3 and 10) - counts of an
  event that is about to become far rarer.
- `economy.sceneStandingProgress.marqueeBarYenByTier` (500k / 1.2m / 3m / 8m) - unaffected by the
  matched change in principle, since it is a price bar, but a Shop-stage promotion now needs a
  matched sale AND that price, so the joint probability moved.
- `economy.sceneStandingProgress.wordOfMouthMultiplierByStage` (1.4 / 1.8 / 2.4) and
  `rollingWindowShareCap` (1.5) - the share term prices concentration, and concentration is
  cheaper to achieve when fewer cars qualify anywhere.
- `economy.sceneStandingProgress.rollingWindowDays` (14).
- `economy.valuation.sceneStanding` bands (known floor 0.92; respected 0.95 / 1.17; shop
  0.95 / 1.25).
- `economy.valuation.matchedTasteScoreThreshold` (0.5) - see the open decision below.
- `economy.sceneCommissions.refreshIntervalDays` (7) and `payoutMultiplier` (1.25).

## Levers (directive 22)

**Deliberately empty at planning time.** Every candidate is named above; **not one carries a
proposed value**, because proposing one before half one runs would be inventing a number and
calling it evidence. The lever table is filled by half one's measurement and signed before half
two starts.

## Definition of done

- The measurement exists and is reproducible, as a committed probe rather than a one-off.
- Every lever that moved is listed by name and value with the maintainer's sign-off recorded.
- Every lever that did NOT move is listed too, with the measured reason it stayed, so a later
  sprint does not re-open a settled number.
- The scene-standing acceptance test from sprint 181 still passes, or its assertions are updated
  under directive 17 case (a) with the new correct behaviour stated.

## Deliberately not here

- **The reputation rework**, sprint 184.
- **Any change to the taste formula itself.** If half one shows sprint 182 overshot, that is a
  finding to report, not a thing to quietly correct here.

## Exit

*(Filled on completion.)*
