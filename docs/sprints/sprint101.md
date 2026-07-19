# Sprint 101: Mileage becomes a hint, not a tax (economy legibility, stage 4, optional)

**Date:** 2026-07-19 (planned; maintainer option - confirm before opening)
**Source:** `docs/design/economy-legibility.md` plank 4, mileage row; the maintainer's
2026-07-19 challenge that the mileage curve is flat and ungrounded.

**Goal:** high-mileage cars ROLL worse condition at generation (mileage-correlated band
distributions), and the `mileageFactorCurve` in the value engine flattens toward
removal - so the odometer becomes information about likely condition rather than a
second tax on wear the bands already price.

## Scope sketch

- `generateAuctionCarInstance`: band roll distributions keyed to a mileage bracket
  (content-law: the brackets and weights live in `economy.json`).
- Value engine: curve flattened to 1.0 (or removed with its schema field) once
  generation carries the signal - staged so the two changes are separately visible in
  the coherence probes.
- The scripted tutorial lot is authored, not rolled: untouched.
- Probes: coherence and value-model re-derivation; auction price spreads shift (worse
  average condition at high km) - disclosed, and the maintainer tunes brackets by
  playtest.

## Exit (drafted when opened)

- [ ] A 30k km lot and a 160k km lot of the same model read believably different on
      the card, and the difference is all condition, not curve arithmetic.
